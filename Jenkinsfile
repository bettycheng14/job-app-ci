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
        // Downloads sonar-scanner at runtime — no plugin or local SonarQube needed.
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
                            -Dsonar.host.url=https://sonarcloud.io \
                            -Dsonar.organization=bettycheng14 \
                            -Dsonar.projectKey=bettycheng14_auth-service \
                            -Dsonar.projectName="Auth Service" \
                            -Dsonar.projectBaseDir=auth-service \
                            -Dsonar.sources=src \
                            -Dsonar.exclusions=src/index.js,src/models/**,node_modules/**,coverage/** \
                            -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
                            -Dsonar.qualitygate.wait=true \
                            -Dsonar.qualitygate.wait.timeout=300 \
                            -Dsonar.token=$SONAR_TOKEN

                        echo "=== Scanning jobapp-service ==="
                        ./sonar-scanner-*/bin/sonar-scanner \
                            -Dsonar.host.url=https://sonarcloud.io \
                            -Dsonar.organization=bettycheng14 \
                            -Dsonar.projectKey=bettycheng14_jobapp-service \
                            -Dsonar.projectName="JobApp Service" \
                            -Dsonar.projectBaseDir=jobapp-service \
                            -Dsonar.sources=src \
                            -Dsonar.exclusions=src/index.js,src/models/**,src/middleware/upload.js,node_modules/**,coverage/** \
                            -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
                            -Dsonar.qualitygate.wait=true \
                            -Dsonar.qualitygate.wait.timeout=300 \
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
                            --format json \
                            --output trivy-auth-report.json \
                            ${DOCKER_HUB_USER}/auth-service:${IMAGE_TAG}

                        trivy image --severity HIGH,CRITICAL \
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
        stage('Deploy (Staging)') {
            steps {
                echo 'Deploy (Staging) — to be implemented'
            }
        }

        // ── STAGE 6: RELEASE ──────────────────────────────────────────
        stage('Release') {
            steps {
                echo 'Release — to be implemented'
            }
        }

        // ── STAGE 7: MONITORING ───────────────────────────────────────
        stage('Monitoring') {
            steps {
                echo 'Monitoring — to be implemented'
            }
        }
    }

    post {
        success  { echo 'Pipeline completed successfully.' }
        unstable { echo 'UNSTABLE — security findings detected. Review archived reports before promoting.' }
        failure  { echo "Pipeline FAILED. Review stage logs at ${env.BUILD_URL}console" }
    }
}
