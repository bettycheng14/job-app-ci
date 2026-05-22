pipeline {
    agent any

    environment {
        DOCKER_HUB_USER     = 'bettyyyc14'
        DEPLOY_HOST         = 'host.docker.internal'
        STAGING_PORT_AUTH   = '3001'
        STAGING_PORT_JOBAPP = '3002'
        PROD_PORT_AUTH      = '4001'
        PROD_PORT_JOBAPP    = '4002'
        PROJECT_DIR         = "${WORKSPACE}"
        // coverage threshold
        COVERAGE_THRESHOLD  = '80'
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 60, unit: 'MINUTES')
        timestamps()
        disableConcurrentBuilds()
    }

    triggers {
        githubPush()
    }

    stages {

        // ============================================================
        // STAGE 1 — BUILD
        // ============================================================
        stage('Build') {
            steps {

                script {
                    env.IMAGE_TAG = sh(
                        script: 'git rev-parse --short=7 HEAD',
                        returnStdout: true
                    ).trim()
                    echo "IMAGE TAG: ${env.IMAGE_TAG}"
                }

                sh '''
                    set -e

                    cd auth-service
                    npm ci
                    cd ..

                    cd jobapp-service
                    npm ci
                    cd ..
                '''

                sh """
                    docker build \
                        --label version=${IMAGE_TAG} \
                        --label commit=${GIT_COMMIT} \
                        -t ${DOCKER_HUB_USER}/auth-service:${IMAGE_TAG} \
                        -t ${DOCKER_HUB_USER}/auth-service:latest \
                        ./auth-service

                    docker build \
                        --label version=${IMAGE_TAG} \
                        --label commit=${GIT_COMMIT} \
                        -t ${DOCKER_HUB_USER}/jobapp-service:${IMAGE_TAG} \
                        -t ${DOCKER_HUB_USER}/jobapp-service:latest \
                        ./jobapp-service
                """

                sh """
                    echo IMAGE_TAG=${IMAGE_TAG} > build-info.txt
                    echo BUILD_TIME=\$(date) >> build-info.txt
                    echo GIT_COMMIT=${GIT_COMMIT} >> build-info.txt
                """

                archiveArtifacts(
                    artifacts: 'build-info.txt',
                    fingerprint: true
                )
            }

            post {
                failure {
                    echo 'BUILD FAILED'
                }
            }
        }

        // ============================================================
        // STAGE 2 — TEST
        // ============================================================
        stage('Test') {

            parallel {

                stage('Auth Service Tests') {
                    steps {
                        sh '''
                            cd auth-service

                            npm run test:ci -- \
                                --coverage \
                                --coverageThreshold='{
                                    "global":{
                                        "branches":65,
                                        "functions":80,
                                        "lines":80,
                                        "statements":80
                                    }
                                }'
                        '''
                    }
                }

                stage('JobApp Service Tests') {
                    steps {
                        sh '''
                            cd jobapp-service

                            npm run test:ci -- \
                                --coverage \
                                --coverageThreshold='{
                                    "global":{
                                        "branches":65,
                                        "functions":80,
                                        "lines":80,
                                        "statements":80
                                    }
                                }'
                        '''
                    }
                }
            }

            post {

                always {

                    junit(
                        allowEmptyResults: true,
                        testResults: '''
                            auth-service/test-results/junit.xml,
                            jobapp-service/test-results/junit.xml
                        '''
                    )

                    publishHTML(target: [
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'auth-service/coverage/lcov-report',
                        reportFiles: 'index.html',
                        reportName: 'Auth Coverage Report'
                    ])

                    publishHTML(target: [
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'jobapp-service/coverage/lcov-report',
                        reportFiles: 'index.html',
                        reportName: 'JobApp Coverage Report'
                    ])

                    archiveArtifacts(
                        artifacts: '''
                            auth-service/coverage/**,
                            jobapp-service/coverage/**,
                            auth-service/test-results/**,
                            jobapp-service/test-results/**
                        ''',
                        allowEmptyArchive: true
                    )
                }

                failure {
                    echo 'TEST STAGE FAILED — check JUnit results and coverage thresholds.'
                }
            }
        }

        // ============================================================
        // STAGE 3 — CODE QUALITY
        // ============================================================
        stage('Code Quality') {

            steps {

                withCredentials([
                    string(
                        credentialsId: 'SONAR_TOKEN',
                        variable: 'SONAR_TOKEN'
                    )
                ]) {
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

                        echo "=== SCANNING auth-service ==="

                        ./sonar-scanner-*/bin/sonar-scanner \
                            -Dproject.settings=auth-service/sonar-project.properties \
                            -Dsonar.projectBaseDir=auth-service \
                            -Dsonar.token=$SONAR_TOKEN

                        echo "=== SCANNING jobapp-service ==="

                        ./sonar-scanner-*/bin/sonar-scanner \
                            -Dproject.settings=jobapp-service/sonar-project.properties \
                            -Dsonar.projectBaseDir=jobapp-service \
                            -Dsonar.token=$SONAR_TOKEN
                    '''
                }
            }

            post {

                success {

                    echo 'SONAR QUALITY GATE PASSED' 
                           }

                failure {
                    echo 'SONAR QUALITY GATE FAILED — check https://sonarcloud.io/organizations/bettycheng14/projects'
                }
            }
        }

        // ============================================================
        // STAGE 4 — SECURITY
        // ============================================================
        stage('Security') {

            steps {

                sh '''
                    set +e

                    cd auth-service
                    npm audit --audit-level=high --json \
                        > ../auth-audit-report.json 2>&1
                    cd ..

                    cd jobapp-service
                    npm audit --audit-level=high --json \
                        > ../jobapp-audit-report.json 2>&1
                    cd ..

                    exit 0
                '''

                // HIGH findings -> unstable
                catchError(
                    buildResult: 'UNSTABLE', stageResult: 'UNSTABLE'
                ) {
                    sh """
                         trivy image \
                            --scanners vuln \
                            --severity HIGH \
                            --exit-code 1 \
                            --format table \
                            --output trivy-auth-high.txt \
                            ${DOCKER_HUB_USER}/auth-service:${IMAGE_TAG}

                        cat trivy-auth-high.txt

                        trivy image \
                            --scanners vuln \
                            --severity HIGH \
                            --exit-code 1 \
                            --format table \
                            --output trivy-jobapp-high.txt \
                            ${DOCKER_HUB_USER}/jobapp-service:${IMAGE_TAG}

                        cat trivy-jobapp-high.txt
                    """
                }

                // CRITICAL findings -> fail
                sh """
                    trivy image \
                        --scanners vuln \
                        --severity CRITICAL \
                        --exit-code 1 \
                        --format table \
                        --output trivy-auth-critical.txt \
                        ${DOCKER_HUB_USER}/auth-service:${IMAGE_TAG}

                        cat trivy-auth-critical.txt

                    trivy image \
                        --scanners vuln \
                        --severity CRITICAL \
                        --exit-code 1 \
                        --format table \
                        --output trivy-jobapp-critical.txt \
                        ${DOCKER_HUB_USER}/jobapp-service:${IMAGE_TAG}

                        cat trivy-jobapp-critical.txt
                """
            }

            post {
                always {
                    archiveArtifacts(
                        artifacts: '''
                            *.json,
                            trivy-*.json,
                            *-audit-report.json
                        ''',
                        allowEmptyArchive: true
                    )
                }

                unstable {
                    echo 'HIGH SECURITY FINDINGS DETECTED'
                }

                failure {
                    echo 'CRITICAL SECURITY FINDINGS DETECTED'
                }
            }
        }

        // ============================================================
        // STAGE 5 — DEPLOY TO STAGING
        // ============================================================
        stage('Deploy (Staging)') {

            when {
                branch 'main'
            }

            steps {

                sh """
                    IMAGE_TAG=${IMAGE_TAG} \
                    docker compose \
                        -p job-app-staging \
                        -f docker-compose.staging.yml \
                        up -d
                """

                sh """
                    echo 'Waiting for staging services...'

                    for i in \$(seq 1 18); do

                        if curl -sf \
                            http://${DEPLOY_HOST}:${STAGING_PORT_AUTH}/health \
                            > /dev/null 2>&1; then

                            echo 'auth-service ready'
                            break
                        fi

                        echo "Attempt \$i/18"
                        sleep 5
                    done

                    curl -f \
                        http://${DEPLOY_HOST}:${STAGING_PORT_AUTH}/health

                    curl -f \
                        http://${DEPLOY_HOST}:${STAGING_PORT_JOBAPP}/health
                """
            }

            post {

                failure {

                    sh '''
                        docker compose \
                            -p job-app-staging \
                            -f docker-compose.staging.yml \
                            logs --tail=50 || true
                    '''

                    echo 'STAGING DEPLOY FAILED'
                }
            }
        }

        // ============================================================
        // STAGE 6 — RELEASE TO PRODUCTION
        // ============================================================
        stage('Release') {

            when {
                branch 'main'
            }

            steps {

                script {

                    // save current version for rollback
                    sh """
                        echo ${IMAGE_TAG} > current-release.txt
                    """

                    archiveArtifacts(
                        artifacts: 'current-release.txt',
                        fingerprint: true
                    )
                }

                // ----------------------------------------------------
                // PUSH IMAGES
                // ----------------------------------------------------
                withCredentials([
                    string(
                        credentialsId: 'DOCKER_HUB_TOKEN',
                        variable: 'DOCKER_HUB_TOKEN'
                    )
                ]) {

                    sh """
                        echo \$DOCKER_HUB_TOKEN | docker login \
                            -u ${DOCKER_HUB_USER} \
                            --password-stdin

                        docker push ${DOCKER_HUB_USER}/auth-service:${IMAGE_TAG}
                        docker push ${DOCKER_HUB_USER}/auth-service:latest

                        docker push ${DOCKER_HUB_USER}/jobapp-service:${IMAGE_TAG}
                        docker push ${DOCKER_HUB_USER}/jobapp-service:latest

                        docker logout
                    """
                }

                // ----------------------------------------------------
                // GIT TAGGING
                // ----------------------------------------------------
                withCredentials([
                    usernamePassword(
                        credentialsId: 'GITHUB_TOKEN',
                        usernameVariable: 'GH_USER',
                        passwordVariable: 'GH_TOKEN'
                    )
                ]) {

                    sh """
                        git config user.email 'jenkins@ci.local'
                        git config user.name  'Jenkins CI'

                        if git rev-parse v${IMAGE_TAG} >/dev/null 2>&1; then
                            echo 'Tag already exists'
                        else
                            git tag -a v${IMAGE_TAG} \
                                -m 'Release v${IMAGE_TAG}'
                        fi

                        REMOTE_URL=\$(git remote get-url origin | \
                            sed 's|https://|https://\$GH_USER:\$GH_TOKEN@|')

                        git push \$REMOTE_URL v${IMAGE_TAG}
                    """
                }

                // ----------------------------------------------------
                // DEPLOY PRODUCTION
                // ----------------------------------------------------
                sh """
                    IMAGE_TAG=${IMAGE_TAG} \
                    docker compose \
                        -p job-app-prod \
                        -f docker-compose.prod.yml \
                        up -d
                """

                // ----------------------------------------------------
                // HEALTH CHECK
                // ----------------------------------------------------
                sh """
                    echo 'Waiting for production health checks...'

                    for i in \$(seq 1 18); do

                        if curl -sf \
                            http://${DEPLOY_HOST}:${PROD_PORT_AUTH}/health \
                            > /dev/null 2>&1; then

                            echo 'Production auth-service ready'
                            break
                        fi

                        sleep 5
                    done

                    curl -f \
                        http://${DEPLOY_HOST}:${PROD_PORT_AUTH}/health

                    curl -f \
                        http://${DEPLOY_HOST}:${PROD_PORT_JOBAPP}/health
                """
            }

            post {
                // ----------------------------------------------------
                // ROLLBACK ON FAILURE
                // ----------------------------------------------------
                failure {
                    echo 'PRODUCTION DEPLOY FAILED'
                    script {
                        if (fileExists('previous-successful-release.txt')) {

                            env.ROLLBACK_TAG = sh(
                                script: 'cat previous-successful-release.txt',
                                returnStdout: true
                            ).trim()

                            echo "ROLLING BACK TO ${env.ROLLBACK_TAG}"

                            sh """
                                IMAGE_TAG=${ROLLBACK_TAG} \
                                docker compose \
                                    -p job-app-prod \
                                    -f docker-compose.prod.yml \
                                    up -d
                            """
                        }
                    }
                }

                success {

                    sh """
                        echo ${IMAGE_TAG} \
                            > previous-successful-release.txt
                    """

                    archiveArtifacts(
                        artifacts: 'previous-successful-release.txt',
                        fingerprint: true
                    )
                }
            }
        }

        // ============================================================
        // STAGE 7 — MONITORING
        // ============================================================
        stage('Monitoring') {

            when {
                branch 'main'
            }

            steps {

                // ----------------------------------------------------
                // VERIFY METRICS
                // ----------------------------------------------------
                sh """
                    curl -sf \
                        http://${DEPLOY_HOST}:${PROD_PORT_AUTH}/metrics \
                        > /dev/null

                    curl -sf \
                        http://${DEPLOY_HOST}:${PROD_PORT_JOBAPP}/metrics \
                        > /dev/null

                    echo 'Metrics endpoints verified.'
                """

                // ----------------------------------------------------
                // START MONITORING STACK
                // ----------------------------------------------------
                sh """
                    docker compose \
                        -p job-app-monitoring \
                        -f docker-compose.monitoring.yml \
                        up -d --force-recreate
                """

                // ----------------------------------------------------
                // WAIT FOR PROMETHEUS
                // ----------------------------------------------------
                sh """
                    echo 'Waiting for Prometheus...'
                    for i in \$(seq 1 20); do
                        if curl -sf \
                            http://${DEPLOY_HOST}:9090/-/ready \
                            > /dev/null 2>&1; then
                            echo 'Prometheus ready'
                            break
                        fi
                        sleep 3
                    done
                """

                // ----------------------------------------------------
                // WAIT FOR GRAFANA
                // ----------------------------------------------------
                sh """
                    echo 'Waiting for Grafana...'
                    for i in \$(seq 1 20); do
                        if curl -sf \
                            http://${DEPLOY_HOST}:3000/api/health \
                            > /dev/null 2>&1; then

                            echo 'Grafana ready'
                            break
                        fi

                        sleep 3
                    done
                """

                // ----------------------------------------------------
                // GENERATE TRAFFIC
                // ----------------------------------------------------
                sh """
                    echo 'Generating baseline traffic...'
                    for i in \$(seq 1 20); do
                        curl -sf \
                            http://${DEPLOY_HOST}:${PROD_PORT_AUTH}/health \
                            > /dev/null || true
                        curl -sf \
                            http://${DEPLOY_HOST}:${PROD_PORT_JOBAPP}/health \
                            > /dev/null || true
                    done
                """

                // ----------------------------------------------------
                // INCIDENT SIMULATION
                // ----------------------------------------------------
                sh """
                    echo 'Simulating outage...'

                    docker compose \
                        -p job-app-prod \
                        -f docker-compose.prod.yml \
                        stop auth-service

                    sleep 40

                    echo 'Checking alerts...'

                    curl -s \
                        "http://${DEPLOY_HOST}:9090/api/v1/alerts"
                """

                // ----------------------------------------------------
                // RECOVERY
                // ----------------------------------------------------
                sh """
                    echo 'Recovering service...'
                    docker compose \
                        -p job-app-prod \
                        -f docker-compose.prod.yml \
                        start auth-service

                    for i in \$(seq 1 12); do
                        if curl -sf \
                            http://${DEPLOY_HOST}:${PROD_PORT_AUTH}/health \
                            > /dev/null 2>&1; then
                            echo 'Service recovered'
                            break
                        fi

                        sleep 5
                    done
                """
                // ----------------------------------------------------
                // FINAL STACK HEALTH CHECKS
                // ----------------------------------------------------
                sh """
                    curl -sf http://${DEPLOY_HOST}:9090/-/ready  > /dev/null && echo 'Prometheus: healthy' || echo 'Prometheus: not ready'
                    curl -sf http://${DEPLOY_HOST}:3000/api/health > /dev/null && echo 'Grafana:    healthy' || echo 'Grafana:    not ready'
                """
            }
            post {

                failure {

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
    }

    // ================================================================
    // PIPELINE POST ACTIONS (EMAIL NOTIFICATIONS, CLEANUP)
    // ================================================================
    post {

        success {

            echo 'PIPELINE SUCCESS'

            mail(
                to: 'yycbetty14@gmail.com',
                subject: "SUCCESS: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                body: """\
Pipeline completed successfully.

Build: ${env.BUILD_NUMBER}
Tag: ${env.IMAGE_TAG}

Stages Passed: Build | Test | Code Quality | Security | Staging | Release | Monitoring

Production:
http://localhost:4001
http://localhost:4002

Prometheus:
http://localhost:9090

Grafana Dashboard with Prometheus data source:
http://localhost:3000/d/job-app-overview/job-application-platform

Artifacts:
${env.BUILD_URL}artifact/
"""
            )
        }

        unstable {

            echo 'PIPELINE UNSTABLE — security findings detected. Review archived reports before promoting.'

            mail(
                to: 'yycbetty14@gmail.com',
                subject: "UNSTABLE: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                body: """\
Pipeline completed with warnings.

Please review:
- Trivy reports
- npm audit reports
- SonarCloud results

Action required: Review Trivy and npm audit reports before promoting to production.

Job:    ${env.JOB_NAME}
Build:  #${env.BUILD_NUMBER}
Tag:    ${env.IMAGE_TAG}
URL:    ${env.BUILD_URL}
Logs:   ${env.BUILD_URL}console
Archived reports: 
${env.BUILD_URL}artifact/
"""
            )
        }

        failure {
            echo 'PIPELINE FAILED. Review stage logs at ${env.BUILD_URL}console'

            mail(
                to: 'yycbetty14@gmail.com',
                subject: "FAILED: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                body: """\
Pipeline failed.

Job:    ${env.JOB_NAME}
Build:  #${env.BUILD_NUMBER}
URL:    ${env.BUILD_URL}
Logs:   ${env.BUILD_URL}console
"""
            )
        }

        always {

            cleanWs()
        }
    }
}
