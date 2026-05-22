# Job Application Platform

A Node.js / Express microservices platform with a fully automated Jenkins CI/CD pipeline (SIT753 7.3HD).

## Services

| Service | Local port | Responsibility |
|---|---|---|
| `auth-service` | 3001 (staging) / 4001 (prod) | User registration, login, JWT issuance |
| `jobapp-service` | 3002 (staging) / 4002 (prod) | Job application submission, resume storage |

---

## Run locally

```bash
# Start both services + MongoDB
docker compose up -d

# Auth service:   http://localhost:3001
# JobApp service: http://localhost:3002
```

### Environment variables

Copy the example files and fill in real values:

```bash
cp auth-service/.env.example   auth-service/.env
cp jobapp-service/.env.example jobapp-service/.env
```

| Variable | Service | Purpose |
|---|---|---|
| `MONGO_URI` | both | MongoDB connection string |
| `JWT_SECRET` | both | Secret used to sign / verify JWTs |
| `GCS_BUCKET_NAME` | jobapp | If set, resumes are uploaded to GCS; otherwise saved locally |

---

## Run tests locally

```bash
cd auth-service  && npm ci && npm test
cd jobapp-service && npm ci && npm test
```

Coverage reports land in `*/coverage/lcov-report/`.
JUnit XML reports land in `*/test-results/junit.xml` (consumed by Jenkins).

---

## Jenkins setup

### Start Jenkins

```bash
docker compose -f docker-compose.jenkins.yml up -d
# Jenkins UI: http://localhost:8080
```

### Required plugins

Install via **Manage Jenkins → Plugins**:

| Plugin | Purpose |
|---|---|
| **Docker Pipeline** | `docker build`, `docker push` in pipeline |
| **JUnit** | Publish test results |
| **HTML Publisher** | Publish coverage reports |
| **Credentials Binding** | `withCredentials` step |
| **Email Extension** | Pipeline email notifications |
| **Workspace Cleanup** | `cleanWs()` post step |

### Credentials to create

Go to **Manage Jenkins → Credentials → System → Global credentials**:

| Credential ID | Type | Value |
|---|---|---|
| `DOCKER_HUB_TOKEN` | Secret text | Docker Hub access token for `bettyyyc14` |
| `GITHUB_TOKEN` | Secret text | GitHub classic PAT with `repo` scope |
| `SONAR_TOKEN` | Secret text | SonarCloud user token |

### Pointing Jenkins at the Jenkinsfile

1. **New Item → Pipeline**
2. Under **Pipeline definition** choose **Pipeline script from SCM**
3. SCM: Git → repo URL → branch `main`
4. Script path: `Jenkinsfile`

---

## Pipeline stages

| # | Stage | Tools | Outputs |
|---|---|---|---|
| 1 | **Build** | npm, Docker | Docker images tagged `:<sha7>` and `:latest`; `build-info.txt` artifact |
| 2 | **Test** | Jest 29, Supertest, jest-junit | JUnit XML, lcov HTML coverage report |
| 3 | **Code Quality** | SonarCloud, SonarScanner CLI 8.0.1 | SonarCloud dashboard analysis |
| 4 | **Security** | npm audit, Trivy | `trivy-*.txt`, `*-audit-report.json` artifacts |
| 5 | **Deploy (Staging)** | Docker Compose | Services healthy on ports 3001 / 3002 |
| 6 | **Release** | Docker Hub, Git tagging, Docker Compose | Images pushed, git tag `v<sha7>`, prod on ports 4001 / 4002 |
| 7 | **Monitoring** | Prometheus, Grafana, prom-client | Metrics verified; Grafana dashboard live on port 3000 |

Stages 5–7 run only on the `main` branch.

---

## Accessing the deployed application

### Production

| Service | URL |
|---|---|
| Auth health | http://localhost:4001/health |
| Auth API | http://localhost:4001/api/auth |
| JobApp health | http://localhost:4002/health |
| JobApp API | http://localhost:4002/api/applications |

### Staging

| Service | URL |
|---|---|
| Auth | http://localhost:3001 |
| JobApp | http://localhost:3002 |

### Monitoring

| Tool | URL |
|---|---|
| Grafana dashboard | http://localhost:3000/d/job-app-overview/job-application-platform |
| Prometheus | http://localhost:9090 |
| Prometheus targets | http://localhost:9090/targets |

Grafana default login: `admin` / `admin`

The **Job Application Platform** dashboard is auto-provisioned and shows:
- HTTP request rate per service
- 5xx error rate per service
- P95 response latency per service

---

## Standalone commands

### Start monitoring stack only

```bash
docker compose -f docker-compose.monitoring.yml up -d
```

### Security scanning

```bash
# Trivy image scan
trivy image --severity HIGH,CRITICAL bettyyyc14/auth-service:latest
trivy image --severity HIGH,CRITICAL bettyyyc14/jobapp-service:latest

# npm audit
cd auth-service   && npm audit --audit-level=high
cd jobapp-service && npm audit --audit-level=high
```

Known vulnerabilities and mitigations are documented in [SECURITY.md](SECURITY.md).
