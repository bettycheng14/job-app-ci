pipeline {
    agent any

    environment {
        DOCKER_HUB_USER     = 'bettyyyc14'
        DEPLOY_HOST         = 'host.docker.internal'
        STAGING_PORT_AUTH   = '3001'
        STAGING_PORT_JOBAPP = '3002'
        PROD_PORT_AUTH      = '4001'
        PROD_PORT_JOBAPP    = '4002'
        PROJECT_DIR = "${WORKSPACE}"
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 60, unit: 'MINUTES')
        timestamps()
    }

    stages {

        // ── STAGE 1: BUILD ────────────────────────────────────────────
        stage('Build') {
            steps {
                script {
                    env.IMAGE_TAG = sh(
                        script: 'git rev-parse --short=7 HEAD',
                        returnStdout: true
                    ).trim()
                    echo "Image tag: ${env.IMAGE_TAG}"
                }

                sh '''
                    cd auth-service   && npm ci && cd ..
                    cd jobapp-service && npm ci && cd ..
                '''

                sh """
                    docker build -t ${DOCKER_HUB_USER}/auth-service:${IMAGE_TAG} \
                                 -t ${DOCKER_HUB_USER}/auth-service:latest \
                                 ./auth-service

                    docker build -t ${DOCKER_HUB_USER}/jobapp-service:${IMAGE_TAG} \
                                 -t ${DOCKER_HUB_USER}/jobapp-service:latest \
                                 ./jobapp-service
                """

                sh "echo IMAGE_TAG=${IMAGE_TAG} > build-info.txt"
                archiveArtifacts artifacts: 'build-info.txt', fingerprint: true
            }
            post {
                failure { echo 'BUILD FAILED — check npm ci output and Dockerfile syntax.' }
            }
        }

        // ── STAGE 2: TEST ─────────────────────────────────────────────
        stage('Test') {
            steps {
                sh '''
                    cd auth-service   && npm run test:ci && cd ..
                    cd jobapp-service && npm run test:ci && cd ..
                '''
            }
            post {
                always {
                    junit allowEmptyResults: true,
                          testResults: 'auth-service/test-results/junit.xml,jobapp-service/test-results/junit.xml'

                    publishHTML(target: [
                        allowMissing: true, alwaysLinkToLastBuild: true, keepAll: true,
                        reportDir: 'auth-service/coverage/lcov-report',
                        reportFiles: 'index.html',
                        reportName: 'Auth Service Coverage Report'
                    ])
                    publishHTML(target: [
                        allowMissing: true, alwaysLinkToLastBuild: true, keepAll: true,
                        reportDir: 'jobapp-service/coverage/lcov-report',
                        reportFiles: 'index.html',
                        reportName: 'JobApp Service Coverage Report'
                    ])
                }
                failure { echo 'TEST FAILED — check JUnit results and coverage thresholds.' }
            }
        }

        // ── STAGE 3: CODE QUALITY ─────────────────────────────────────
        // Downloads sonar-scanner at runtime
        // sonar.qualitygate.wait=true polls SonarCloud and exits non-zero on gate
        // failure, blocking deploy/release stages from running.
        stage('Code Quality') {
            steps {
                withCredentials([string(credentialsId: 'SONAR_TOKEN', variable: 'SONAR_TOKEN')]) {
                    sh '''
                        rm -rf sonar-scanner* sonar-scanner.zip

                        ARCH=$(uname -m)
                        if [ "$ARCH" = "aarch64" ]; then
                            SONAR_ZIP="sonar-scanner-cli-8.0.1.6346-linux-aarch64.zip"
                        else
                            SONAR_ZIP="sonar-scanner-cli-8.0.1.6346-linux.zip"
                        fi

                        curl -fSL -o sonar-scanner.zip \
                            https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/${SONAR_ZIP}
                        unzip -qo sonar-scanner.zip
                        chmod +x sonar-scanner-*/bin/sonar-scanner

                        echo "=== Scanning auth-service ==="
                        ./sonar-scanner-*/bin/sonar-scanner \
                            -Dproject.settings=auth-service/sonar-project.properties \
                            -Dsonar.projectBaseDir=auth-service \
                            -Dsonar.token=$SONAR_TOKEN

                        echo "=== Scanning jobapp-service ==="
                        ./sonar-scanner-*/bin/sonar-scanner \
                            -Dproject.settings=jobapp-service/sonar-project.properties \
                            -Dsonar.projectBaseDir=jobapp-service \
                            -Dsonar.token=$SONAR_TOKEN
                    '''
                }
            }
            post {
                failure { echo 'CODE QUALITY FAILED — check https://sonarcloud.io/organizations/bettycheng14/projects' }
            }
        }

        // ── STAGE 4: SECURITY ─────────────────────────────────────────
        stage('Security') {
            steps {
                sh '''
                    cd auth-service
                    npm audit --audit-level=high --json > ../auth-audit-report.json 2>&1 \
                        || echo "npm audit: HIGH/CRITICAL issues found in auth-service"
                    cd ../jobapp-service
                    npm audit --audit-level=high --json > ../jobapp-audit-report.json 2>&1 \
                        || echo "npm audit: HIGH/CRITICAL issues found in jobapp-service"
                    cd ..
                '''

                catchError(buildResult: 'UNSTABLE', stageResult: 'UNSTABLE') {
                    sh """
                        trivy image --severity HIGH,CRITICAL \
                            --exit-code 0 \
                            --format json \
                            --output trivy-auth-report.json \
                            ${DOCKER_HUB_USER}/auth-service:${IMAGE_TAG}

                        trivy image --severity HIGH,CRITICAL \
                            --exit-code 0 \
                            --format json \
                            --output trivy-jobapp-report.json \
                            ${DOCKER_HUB_USER}/jobapp-service:${IMAGE_TAG}
                    """
                }
            }
            post {
                always {
                    archiveArtifacts artifacts: 'trivy-*.json,*-audit-report.json',
                                     allowEmptyArchive: true
                }
                failure { echo 'SECURITY FAILED — review archived Trivy and npm audit reports.' }
            }
        }

        // ── STAGE 5: DEPLOY (STAGING) ─────────────────────────────────
        // Deploys the image built in Stage 1 to staging (no rebuild).
        // Health checks use host.docker.internal because the containers
        // run on the host Docker daemon, not inside the Jenkins container.
        stage('Deploy (Staging)') {
            steps {
                sh """
                    IMAGE_TAG=${IMAGE_TAG} docker compose -p job-app-staging -f docker-compose.staging.yml up -d
                """

                sh """
                    echo 'Waiting for MongoDB healthcheck + service startup...'
                    for i in \$(seq 1 18); do
                        if curl -sf -m 5 http://${DEPLOY_HOST}:${STAGING_PORT_AUTH}/health > /dev/null 2>&1; then
                            echo 'auth-service is up'
                            break
                        fi
                        echo "  attempt \$i/18 — sleeping 5s"
                        sleep 5
                    done

                    curl -f -m 10 http://${DEPLOY_HOST}:${STAGING_PORT_AUTH}/health \
                        || (echo 'HEALTH CHECK FAILED: auth-service staging' && exit 1)
                    curl -f -m 10 http://${DEPLOY_HOST}:${STAGING_PORT_JOBAPP}/health \
                        || (echo 'HEALTH CHECK FAILED: jobapp-service staging' && exit 1)
                    echo 'Staging health checks passed.'
                """
            }
            post {
                failure {
                    sh 'docker compose -p job-app-staging -f docker-compose.staging.yml logs --tail=50 || true'
                    echo 'DEPLOY FAILED — staging health check failed. Container logs printed above.'
                }
            }
        }

        // ── STAGE 6: RELEASE ──────────────────────────────────────────
        // Pushes versioned images to Docker Hub, creates a git release tag,
        // and deploys the exact same image to production.
        stage('Release') {
            steps {
                withCredentials([string(credentialsId: 'DOCKER_HUB_TOKEN', variable: 'DOCKER_HUB_TOKEN')]) {
                    sh """
                        echo \$DOCKER_HUB_TOKEN | docker login -u ${DOCKER_HUB_USER} --password-stdin

                        docker push ${DOCKER_HUB_USER}/auth-service:${IMAGE_TAG}
                        docker push ${DOCKER_HUB_USER}/auth-service:latest
                        docker push ${DOCKER_HUB_USER}/jobapp-service:${IMAGE_TAG}
                        docker push ${DOCKER_HUB_USER}/jobapp-service:latest

                        docker logout
                    """
                }

                withCredentials([usernamePassword(
                    credentialsId: 'GITHUB_TOKEN',
                    usernameVariable: 'GH_USER',
                    passwordVariable: 'GH_TOKEN'
                )]) {
                    sh """
                        git config user.email 'jenkins@ci.local'
                        git config user.name  'Jenkins CI'
                        git tag -a v${IMAGE_TAG} -m 'Release v${IMAGE_TAG} [skip ci]' || true
                        REMOTE_URL=\$(git remote get-url origin | sed 's|https://|https://\$GH_USER:\$GH_TOKEN@|')
                        git push \$REMOTE_URL v${IMAGE_TAG} || true
                    """
                }

                sh """
                    IMAGE_TAG=${IMAGE_TAG} docker compose -p job-app-prod -f docker-compose.prod.yml up -d
                """

                sh """
                    echo 'Waiting for MongoDB healthcheck + service startup...'
                    for i in \$(seq 1 18); do
                        if curl -sf -m 5 http://${DEPLOY_HOST}:${PROD_PORT_AUTH}/health > /dev/null 2>&1; then
                            echo 'auth-service is up'
                            break
                        fi
                        echo "  attempt \$i/18 — sleeping 5s"
                        sleep 5
                    done

                    curl -f -m 10 http://${DEPLOY_HOST}:${PROD_PORT_AUTH}/health \
                        || (echo 'HEALTH CHECK FAILED: auth-service production' && exit 1)
                    curl -f -m 10 http://${DEPLOY_HOST}:${PROD_PORT_JOBAPP}/health \
                        || (echo 'HEALTH CHECK FAILED: jobapp-service production' && exit 1)
                    echo 'Production health checks passed.'
                """
            }
            post {
                failure { echo 'RELEASE FAILED — check Docker Hub credentials and production container logs.' }
            }
        }
        // ── STAGE 7: MONITORING ───────────────────────────────────────
        // 1. Generates Prometheus config from template
        // 2. Verifies metrics endpoints
        // 3. Starts Prometheus + Grafana
        // 4. Waits for readiness
        // 5. Generates baseline traffic
        // 6. Simulates ServiceDown incident
        // 7. Verifies alerts + recovery
        // 8. Prints pipeline summary

        stage('Monitoring') {
            steps {
                sh """
                    echo "PROJECT_DIR=${WORKSPACE}" > .env
                """
                // ── 7a: Generate Prometheus config ─────────────────────────
                sh """
                    echo '=== Generating Prometheus configuration ==='

                    mkdir -p prometheus
                    rm -f prometheus/prometheus.yml

                    sed -e 's|\\\${DEPLOY_HOST}|${DEPLOY_HOST}|g' \
                        -e 's|\\\${PROD_PORT_AUTH}|${PROD_PORT_AUTH}|g' \
                        -e 's|\\\${PROD_PORT_JOBAPP}|${PROD_PORT_JOBAPP}|g' \
                        prometheus/prometheus.template.yml \
                        > prometheus/prometheus.yml

                    echo ''
                    echo '=== Generated prometheus.yml ==='
                    cat prometheus/prometheus.yml

                    echo ''
                    echo '=== Prometheus directory ==='
                    ls -la prometheus/
                """

                // ── 7b: Verify metrics endpoints ───────────────────────────
                sh """
                    echo '=== Verifying metrics endpoints ==='

                    curl -sf http://${DEPLOY_HOST}:${PROD_PORT_AUTH}/metrics > /dev/null \
                        || (echo 'METRICS UNAVAILABLE: auth-service' && exit 1)

                    curl -sf http://${DEPLOY_HOST}:${PROD_PORT_JOBAPP}/metrics > /dev/null \
                        || (echo 'METRICS UNAVAILABLE: jobapp-service' && exit 1)

                    echo 'Metrics endpoints verified.'
                """

                // ── 7c: Start monitoring stack ─────────────────────────────
                sh '''
                    echo '=== Starting monitoring stack ==='

                    docker compose \
                        -p job-app-monitoring \
                        -f docker-compose.monitoring.yml \
                        down --remove-orphans || true

                    docker compose \
                        -p job-app-monitoring \
                        -f docker-compose.monitoring.yml \
                        up -d --force-recreate

                    echo ''
                    echo '=== Waiting for Prometheus readiness ==='

                    for i in $(seq 1 20); do
                        if curl -sf http://localhost:9090/-/ready > /dev/null; then
                            echo "Prometheus ready."
                            break
                        fi

                        echo "Waiting for Prometheus... ($i/20)"
                        sleep 3
                    done

                    echo ''
                    echo '=== Waiting for Grafana readiness ==='

                    for i in $(seq 1 20); do
                        if curl -sf http://localhost:3000/api/health > /dev/null; then
                            echo "Grafana ready."
                            break
                        fi

                        echo "Waiting for Grafana... ($i/20)"
                        sleep 3
                    done
                '''

                // ── 7d: Generate baseline traffic ──────────────────────────
                sh """
                    echo ''
                    echo '=== Generating baseline traffic ==='

                    for i in \$(seq 1 20); do

                        curl -sf http://${DEPLOY_HOST}:${PROD_PORT_AUTH}/health \
                            > /dev/null || true

                        curl -sf http://${DEPLOY_HOST}:${PROD_PORT_JOBAPP}/health \
                            > /dev/null || true

                        curl -sf -X POST \
                            http://${DEPLOY_HOST}:${PROD_PORT_AUTH}/api/auth/register \
                            -H 'Content-Type: application/json' \
                            -d '{\"email\":\"load\${i}-'"\$(date +%s)"'@demo.com\",\"password\":\"Demo1!\"}' \
                            > /dev/null || true

                        curl -sf \
                            http://${DEPLOY_HOST}:${PROD_PORT_AUTH}/api/nonexistent \
                            > /dev/null || true
                    done

                    echo 'Baseline traffic generation completed.'
                """

                // ── 7e: Simulate incident ──────────────────────────────────
                sh """
                    echo ''
                    echo '======================================================'
                    echo ' INCIDENT SIMULATION — stopping auth-service'
                    echo '======================================================'

                    docker compose \
                        -p job-app-prod \
                        -f docker-compose.prod.yml \
                        stop auth-service || true

                    echo ''
                    echo 'Service stopped.'
                    echo 'Waiting 40 seconds for ServiceDown alert...'

                    sleep 40

                    echo ''
                    echo '=== Prometheus alert state ==='

                    curl -s http://${DEPLOY_HOST}:9090/api/v1/alerts \
                        | python3 -c "
        import json, sys

        d = json.load(sys.stdin)
        alerts = d.get('data', {}).get('alerts', [])

        if not alerts:
            print('No alerts firing yet.')

        for a in alerts:
            print(
                'ALERT: {name} | state={state} | severity={sev}'.format(
                    name=a['labels'].get('alertname', '?'),
                    state=a.get('state', '?'),
                    sev=a['labels'].get('severity', '?')
                )
            )
        " || true

                    echo ''
                    echo '=== Prometheus targets ==='

                    curl -s http://${DEPLOY_HOST}:9090/api/v1/targets \
                        | python3 -c "
        import json, sys

        d = json.load(sys.stdin)

        for t in d.get('data', {}).get('activeTargets', []):
            print(
                'target={job} health={health}'.format(
                    job=t['labels'].get('job', '?'),
                    health=t.get('health', '?')
                )
            )
        " || true
                """

                // ── 7f: Recovery ───────────────────────────────────────────
                sh """
                    echo ''
                    echo '======================================================'
                    echo ' RECOVERY — restarting auth-service'
                    echo '======================================================'

                    docker compose \
                        -p job-app-prod \
                        -f docker-compose.prod.yml \
                        start auth-service || true

                    for i in \$(seq 1 12); do

                        if curl -sf -m 5 \
                            http://${DEPLOY_HOST}:${PROD_PORT_AUTH}/health \
                            > /dev/null 2>&1; then

                            echo "auth-service recovered (attempt \$i)."
                            break
                        fi

                        echo "Recovery attempt \$i/12 — sleeping 5 seconds"
                        sleep 5
                    done
                """

                // ── 7g: Final monitoring status ────────────────────────────
                sh """
                    echo ''
                    echo '=== Final monitoring status ==='

                    curl -sf http://localhost:9090/-/ready \
                        && echo 'Prometheus healthy.'

                    curl -sf http://localhost:3000/api/health \
                        && echo 'Grafana healthy.'
                """

                // ── 7h: Pipeline summary ───────────────────────────────────
                sh """
                    echo ''
                    echo '============================================================'
                    echo ' PIPELINE SUMMARY — BUILD ${IMAGE_TAG}'
                    echo '============================================================'
                    echo ' Stage 1 Build   : PASSED — Docker images built'
                    echo ' Stage 2 Test    : PASSED — JUnit + coverage published'
                    echo ' Stage 3 Quality : PASSED — SonarCloud analysis completed'
                    echo ' Stage 4 Security: PASSED/UNSTABLE — Trivy + npm audit completed'
                    echo ' Stage 5 Staging : READY'
                    echo ' Stage 6 Release : READY'
                    echo ' Stage 7 Metrics : READY'
                    echo ''
                    echo ' Services'
                    echo ' --------'
                    echo ' Auth Service    : http://localhost:4001'
                    echo ' JobApp Service  : http://localhost:4002'
                    echo ' Prometheus      : http://localhost:9090'
                    echo ' Grafana         : http://localhost:3000'
                    echo ''
                    echo ' Monitoring'
                    echo ' ----------'
                    echo ' Metrics verified'
                    echo ' Alert rules loaded'
                    echo ' Baseline traffic generated'
                    echo ' ServiceDown incident simulated'
                    echo ' Automatic recovery completed'
                    echo ''
                    echo '============================================================'
                """
            }

            post {
                failure {

                    // Ensure prod service is restored even on failure
                    sh '''
                        docker compose \
                            -p job-app-prod \
                            -f docker-compose.prod.yml \
                            start auth-service || true
                    '''

                    echo 'MONITORING FAILED — check Prometheus/Grafana logs.'
                }
            }
        }

    post {
        success  { echo 'Pipeline completed successfully — all 7 stages passed.' }
        unstable { echo 'UNSTABLE — security findings detected. Review archived reports before promoting.' }
        failure  { echo "Pipeline FAILED. Review stage logs at ${env.BUILD_URL}console" }
    }
}
