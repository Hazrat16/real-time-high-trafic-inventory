-- 1) Reservation createdAt audit column
-- 2) Additional indexes for expiry/user/drop lookups
-- 3) Partial unique index: one ACTIVE reservation per (dropId, userId)
-- 4) Basic stock sanity constraints on Drop

ALTER TABLE "Reservation"
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Reservation_expiresAt_idx" ON "Reservation"("expiresAt");
CREATE INDEX "Reservation_dropId_idx" ON "Reservation"("dropId");
CREATE INDEX "Reservation_userId_idx" ON "Reservation"("userId");

CREATE UNIQUE INDEX "Reservation_one_active_per_user_drop_idx"
ON "Reservation"("dropId", "userId")
WHERE "status" = 'ACTIVE';

ALTER TABLE "Drop"
ADD CONSTRAINT "Drop_available_nonnegative_chk" CHECK ("availableQuantity" >= 0),
ADD CONSTRAINT "Drop_reserved_nonnegative_chk" CHECK ("reservedQuantity" >= 0),
ADD CONSTRAINT "Drop_total_positive_chk" CHECK ("totalUnits" > 0),
ADD CONSTRAINT "Drop_reserved_within_total_chk" CHECK ("reservedQuantity" <= "totalUnits");
