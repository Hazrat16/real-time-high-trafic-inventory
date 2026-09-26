// CI/CD for the inventory monorepo.
// CI (every branch): build images (install + typecheck + build) -> integration tests against a throwaway Postgres.
// CD (main only):    deploy with docker compose on this host -> smoke test.
// Requires on the Jenkins host: Docker Engine + compose plugin, `jenkins` user in the `docker` group.
// Requires in Jenkins: Secret file credential `inventory-prod-env` (see deploy/.env.prod.example).

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timeout(time: 30, unit: 'MINUTES')
  }

  environment {
    DOCKER_BUILDKIT = '1'
    COMPOSE_CI      = 'docker-compose.ci.yml'
    COMPOSE_PROD    = 'docker-compose.prod.yml'
    CI_PROJECT      = "inventory-ci-${env.BUILD_NUMBER}"
    KEEP_IMAGES     = '3'
  }

  stages {
    stage('Prepare') {
      steps {
        script {
          def sha = sh(returnStdout: true, script: 'git rev-parse --short HEAD').trim()
          env.IMAGE_TAG = "${env.BUILD_NUMBER}-${sha}"
          currentBuild.displayName = "#${env.BUILD_NUMBER} ${sha}"
        }
        sh 'docker version && docker compose version'
        echo "Branch: ${env.BRANCH_NAME ?: env.GIT_BRANCH}  Image tag: ${env.IMAGE_TAG}"
      }
    }

    stage('Build & Typecheck') {
      steps {
        sh '''
          docker build --target build  -t inventory-build:${IMAGE_TAG}  .
          docker build --target server -t inventory-server:${IMAGE_TAG} .
          docker build --target web    -t inventory-web:${IMAGE_TAG}    .
        '''
      }
    }

    stage('Integration Tests') {
      steps {
        sh 'docker compose -f ${COMPOSE_CI} -p ${CI_PROJECT} up --abort-on-container-exit --exit-code-from tests'
      }
      post {
        always {
          sh 'docker compose -f ${COMPOSE_CI} -p ${CI_PROJECT} down -v --remove-orphans || true'
        }
      }
    }

    stage('Deploy') {
      when {
        expression { (env.BRANCH_NAME ?: env.GIT_BRANCH) in ['main', 'origin/main'] }
      }
      steps {
        withCredentials([file(credentialsId: 'inventory-prod-env', variable: 'PROD_ENV_FILE')]) {
          sh '''
            docker compose -f ${COMPOSE_PROD} --env-file "$PROD_ENV_FILE" up -d --no-build --remove-orphans
            docker compose -f ${COMPOSE_PROD} --env-file "$PROD_ENV_FILE" ps
          '''
        }
      }
    }

    stage('Smoke Test') {
      when {
        expression { (env.BRANCH_NAME ?: env.GIT_BRANCH) in ['main', 'origin/main'] }
      }
      steps {
        withCredentials([file(credentialsId: 'inventory-prod-env', variable: 'PROD_ENV_FILE')]) {
          sh '''
            PORT=$(grep -E '^WEB_PORT=' "$PROD_ENV_FILE" | cut -d= -f2)
            BASE="http://localhost:${PORT:-80}"
            for i in $(seq 1 30); do
              if curl -fsS "$BASE/health" >/dev/null; then break; fi
              echo "Waiting for app ($i/30)..."; sleep 3
            done
            curl -fsS "$BASE/health"
            curl -fsS "$BASE/api/v1/drops" >/dev/null
            curl -fsS "$BASE/" | grep -q '<div id="root">'
            echo "Smoke test passed: $BASE"
          '''
        }
      }
    }
  }

  post {
    always {
      // Keep the newest $KEEP_IMAGES tags of each image (for quick rollback), drop the rest.
      sh '''
        for repo in inventory-build inventory-server inventory-web; do
          docker images "$repo" --format '{{.Tag}}' | grep -E '^[0-9]+-' | sort -t- -k1,1 -n -r \
            | tail -n +$((KEEP_IMAGES + 1)) | xargs -r -I{} docker rmi "$repo:{}" || true
        done
        docker image prune -f || true
      '''
    }
    success {
      echo "Pipeline succeeded (${env.IMAGE_TAG})"
    }
    failure {
      echo 'Pipeline failed - check the stage logs above.'
    }
  }
}
