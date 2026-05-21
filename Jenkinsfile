pipeline {
    agent any

    environment {
        DOCKER_HUB_USER = 'bettyyyc14'
        DEPLOY_HOST     = 'host.docker.internal'
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
                        if curl -sf -m 5 http://${DEPLOY_HOST}:3001/health > /dev/null 2>&1; then
                            echo 'auth-service is up'
                            break
                        fi
                        echo "  attempt \$i/18 — sleeping 5s"
                        sleep 5
                    done

                    curl -f -m 10 http://${DEPLOY_HOST}:3001/health \
                        || (echo 'HEALTH CHECK FAILED: auth-service staging' && exit 1)
                    curl -f -m 10 http://${DEPLOY_HOST}:3002/health \
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
                        if curl -sf -m 5 http://${DEPLOY_HOST}:4001/health > /dev/null 2>&1; then
                            echo 'auth-service is up'
                            break
                        fi
                        echo "  attempt \$i/18 — sleeping 5s"
                        sleep 5
                    done

                    curl -f -m 10 http://${DEPLOY_HOST}:4001/health \
                        || (echo 'HEALTH CHECK FAILED: auth-service production' && exit 1)
                    curl -f -m 10 http://${DEPLOY_HOST}:4002/health \
                        || (echo 'HEALTH CHECK FAILED: jobapp-service production' && exit 1)
                    echo 'Production health checks passed.'
                """
            }
            post {
                failure { echo 'RELEASE FAILED — check Docker Hub credentials and production container logs.' }
            }
        }

        // ── STAGE 7: MONITORING ───────────────────────────────────────
        // Verifies /metrics endpoints are live, starts Prometheus + Grafana,
        // and prints a pipeline summary to the console.
        stage('Monitoring') {
            steps {
                sh """
                    curl -sf http://${DEPLOY_HOST}:4001/metrics > /dev/null \
                        || (echo 'METRICS UNAVAILABLE: auth-service (prod)' && exit 1)
                    curl -sf http://${DEPLOY_HOST}:4002/metrics > /dev/null \
                        || (echo 'METRICS UNAVAILABLE: jobapp-service (prod)' && exit 1)
                    echo 'Metrics endpoints verified.'
                """

                sh '''
                    docker compose -p job-app-monitoring -f docker-compose.monitoring.yml up -d
                    sleep 10
                '''

                sh """
                    echo ""
                    echo "============================================================"
                    echo " PIPELINE SUMMARY — BUILD ${IMAGE_TAG}"
                    echo "============================================================"
                    echo " Stage 1 Build   : PASSED — images tagged ${IMAGE_TAG}"
                    echo " Stage 2 Test    : PASSED — JUnit + coverage published"
                    echo " Stage 3 Quality : PASSED — SonarCloud quality gate passed"
                    echo " Stage 4 Security: see archived Trivy/audit reports"
                    echo " Stage 5 Staging : http://localhost:3001  http://localhost:3002"
                    echo " Stage 6 Release : Docker Hub ${DOCKER_HUB_USER}/*:${IMAGE_TAG}"
                    echo "         Prod    : http://localhost:4001  http://localhost:4002"
                    echo " Stage 7 Metrics : http://localhost:4001/metrics"
                    echo "         Grafana : http://localhost:3000"
                    echo "============================================================"
                """
            }
            post {
                failure { echo 'MONITORING FAILED — /metrics unavailable or monitoring stack failed to start.' }
            }
        }
    }

    post {
        success  { echo 'Pipeline completed successfully — all 7 stages passed.' }
        unstable { echo 'UNSTABLE — security findings detected. Review archived reports before promoting.' }
        failure  { echo "Pipeline FAILED. Review stage logs at ${env.BUILD_URL}console" }
    }
}
