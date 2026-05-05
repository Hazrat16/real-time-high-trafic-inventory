import express from "express";
import cors from "cors";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import {
  InventoryError,
  reserveItem,
  completePurchase,
} from "./services/inventory.js";
import { buildRecentPurchasersByDrop, formatDropWithPurchasers, toDropResponse } from "./format.js";
import { notifyDropsChanged } from "./socketHub.js";
import { getExpirySweepStats } from "./services/expirySweep.js";

const uuid = z.string().uuid();
const API_PREFIX = "/api/v1";

export function createApp() {
  const app = express();
  const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

  app.use(
    cors({
      origin: clientOrigin,
      credentials: true,
    }),
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get(`${API_PREFIX}/system/expiry-sweep`, (_req, res) => {
    res.json(getExpirySweepStats());
  });

  app.get(`${API_PREFIX}/users`, async (_req, res, next) => {
    try {
      const users = await prisma.user.findMany({
        orderBy: { username: "asc" },
        select: { id: true, username: true },
      });
      res.json(users);
    } catch (e) {
      next(e);
    }
  });

  app.get(`${API_PREFIX}/drops`, async (_req, res, next) => {
    try {
      const now = new Date();
      const drops = await prisma.drop.findMany({
        where: {
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        },
        orderBy: { startsAt: "desc" },
      });

      const byDrop = await buildRecentPurchasersByDrop(drops.map((d) => d.id));
      const payload = drops.map((drop) =>
        toDropResponse(drop, byDrop.get(drop.id) ?? []),
      );
      res.json(payload);
    } catch (e) {
      next(e);
    }
  });

  const createDropSchema = z
    .object({
      name: z.string().min(1),
      price: z.union([
        z.number().positive(),
        z.string().regex(/^\d+(\.\d{1,2})?$/),
      ]),
      totalUnits: z.number().int().positive(),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime().optional().nullable(),
    })
    .superRefine((body, ctx) => {
      if (body.endsAt && new Date(body.endsAt) <= new Date(body.startsAt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endsAt"],
          message: "endsAt must be greater than startsAt",
        });
      }
    });

  app.post(`${API_PREFIX}/drops`, async (req, res, next) => {
    try {
      const body = createDropSchema.parse(req.body);
      const startsAt = new Date(body.startsAt);
      const endsAt = body.endsAt ? new Date(body.endsAt) : null;

      const price =
        typeof body.price === "number"
          ? body.price.toFixed(2)
          : Number(body.price).toFixed(2);

      const drop = await prisma.drop.create({
        data: {
          name: body.name,
          price,
          totalUnits: body.totalUnits,
          availableQuantity: body.totalUnits,
          reservedQuantity: 0,
          startsAt,
          endsAt,
        },
      });

      notifyDropsChanged();
      const response = await formatDropWithPurchasers(drop);
      res.status(201).json(response);
    } catch (e) {
      if (e instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid body", details: e.flatten() });
        return;
      }
      next(e);
    }
  });

  async function requireUser(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) {
    const parsed = uuid.safeParse(req.header("x-user-id"));
    if (!parsed.success) {
      res.status(401).json({
        error: "Send a valid UUID in the X-User-Id header (pick a demo user).",
      });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: parsed.data },
      select: { id: true },
    });
    if (!user) {
      res.status(401).json({
        error: "Unknown demo user. Select an existing user from the dashboard.",
      });
      return;
    }
    req.userId = user.id;
    next();
  }

  app.get(
    `${API_PREFIX}/reservations/active`,
    requireUser,
    async (req, res, next) => {
      try {
        const dropIdRaw = req.query.dropId;
        const dropFilter =
          typeof dropIdRaw === "string" && dropIdRaw.length > 0
            ? uuid.parse(dropIdRaw)
            : undefined;

        const now = new Date();
        const reservation = await prisma.reservation.findFirst({
          where: {
            userId: req.userId!,
            status: "ACTIVE",
            expiresAt: { gt: now },
            ...(dropFilter ? { dropId: dropFilter } : {}),
          },
          orderBy: { expiresAt: "desc" },
        });

        res.json(reservation);
      } catch (e) {
        if (e instanceof z.ZodError) {
          res.status(400).json({ error: "Invalid dropId query" });
          return;
        }
        next(e);
      }
    },
  );

  const reserveSchema = z.object({
    dropId: z.string().uuid(),
  });

  app.post(`${API_PREFIX}/reservations`, requireUser, async (req, res, next) => {
    try {
      const { dropId } = reserveSchema.parse(req.body);
      const row = await reserveItem(dropId, req.userId!);
      res.status(201).json({
        id: row.id,
        dropId: row.dropId,
        expiresAt: row.expiresAt.toISOString(),
        status: row.status,
      });
    } catch (e) {
      if (e instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid body", details: e.flatten() });
        return;
      }
      if (e instanceof InventoryError) {
        res.status(e.status).json({ error: e.message, code: e.code });
        return;
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.status(400).json({ error: "Invalid reservation request" });
        return;
      }
      next(e);
    }
  });

  const purchaseSchema = z.object({
    reservationId: z.string().uuid(),
  });

  app.post(`${API_PREFIX}/purchases`, requireUser, async (req, res, next) => {
    try {
      const { reservationId } = purchaseSchema.parse(req.body);
      await completePurchase(reservationId, req.userId!);
      res.status(204).send();
    } catch (e) {
      if (e instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid body", details: e.flatten() });
        return;
      }
      if (e instanceof InventoryError) {
        res.status(e.status).json({ error: e.message, code: e.code });
        return;
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.status(400).json({ error: "Invalid purchase request" });
        return;
      }
      next(e);
    }
  });

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    },
  );

  return app;
}
