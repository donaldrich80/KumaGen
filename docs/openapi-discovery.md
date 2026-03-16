# OpenAPI Discovery — Design & Reference

## Concept

Many HTTP services self-document via an OpenAPI (formerly Swagger) spec embedded at a well-known URL. The spec is a machine-readable description of every endpoint the service exposes — paths, methods, summaries, tags, and descriptions. For monitoring purposes, this is more reliable than heuristics: instead of guessing that a Spring Boot app probably has `/actuator/health`, you can *confirm* it does and get the exact path directly from the service itself.

---

## Discovery Process

### 1. Identify candidate ports

Only host-mapped ports are probed — i.e. ports where `hostPort` is non-null. Container-only ports are unreachable from outside the Docker network and are skipped.

### 2. Probe each port

For each host-mapped port, the prober iterates through a list of candidate paths (see below) on both `http` and `https`. Each request uses a **3-second timeout** and fails silently on connection refused, timeout, non-200 response, or non-JSON body.

### 3. Validate the response

A response is considered a valid OpenAPI spec if it is a JSON object containing both an `openapi` or `swagger` key **and** a `paths` key.

### 4. Extract endpoints

From a confirmed spec, the following is extracted per path+method combination:
- HTTP method (`GET`, `POST`, etc.)
- Path string (e.g. `/api/v1/health`)
- `summary` — short human-readable description
- `description` — longer description if present
- `tags` — array of category tags
- `operationId` — machine name for the operation

Request/response schemas are intentionally discarded — they add token weight without value for monitoring purposes.

---

## Probe Paths

The following paths are tried in order on each port, for both `http` and `https`:

| Path | Common source |
|------|--------------|
| `/openapi.json` | OpenAPI 3.x default |
| `/openapi.yaml` | OpenAPI 3.x YAML variant |
| `/swagger.json` | Swagger 2.x default |
| `/swagger/v1/swagger.json` | .NET / ASP.NET Core |
| `/swagger/v2/swagger.json` | .NET versioned |
| `/api-docs` | Springdoc, springfox |
| `/api-docs.json` | Springdoc explicit JSON |
| `/api/openapi.json` | Namespaced APIs |
| `/api/swagger.json` | Namespaced APIs |
| `/api/api-docs` | Namespaced springdoc |
| `/docs/openapi.json` | FastAPI, some Go frameworks |
| `/v1/openapi.json` | Versioned APIs |
| `/v2/openapi.json` | Versioned APIs |
| `/v3/openapi.json` | Versioned APIs |
| `/api/v1/openapi.json` | Namespaced + versioned |
| `/api/v2/openapi.json` | Namespaced + versioned |

Total: **32 requests** per port (16 paths × 2 schemes), all fired sequentially per port, all ports probed in parallel.

---

## What the Extracted Data Enables

Once endpoints are known, a downstream consumer (human or AI) can:

- **Find health/readiness endpoints** — scan paths and summaries for keywords: `health`, `ready`, `live`, `ping`, `status`, `alive`, `heartbeat`, `up`, `metrics`
- **Understand the service identity** — `info.title` and `info.description` from the spec often name the service more precisely than the Docker image name
- **Discover metrics endpoints** — paths like `/metrics`, `/prometheus`, or operations tagged `monitoring`
- **Avoid guessing** — spec-confirmed paths take priority over image-name pattern matching

---

## Limitations & Extension Points

| Limitation | Potential solution |
|------------|-------------------|
| YAML specs are skipped (only JSON parsed) | Add `js-yaml` dependency and detect `Content-Type: application/yaml` |
| Auth-protected specs (401/403) return no data | Accept optional bearer token / API key in probe config |
| gRPC and GraphQL services have no OpenAPI | Add separate probes: gRPC reflection API, `/graphql` introspection query |
| Container-only ports unreachable | Run prober inside Docker network, or use container IP from inspect |
| Some frameworks serve spec at non-standard paths | Allow per-container label override: `openapi.path=/internal/spec` |
| Large specs with hundreds of endpoints | Implement keyword-first filtering before passing to AI |

---

## Framework — Default Spec Locations Reference

| Framework / Language | Default spec path |
|----------------------|------------------|
| FastAPI (Python) | `/openapi.json` |
| Flask-RESTX / Flasgger | `/swagger.json` or `/apispec.json` |
| Django REST Framework + drf-spectacular | `/api/schema/` |
| Spring Boot + springdoc | `/v3/api-docs` |
| Spring Boot + springfox | `/v2/api-docs` |
| ASP.NET Core | `/swagger/v1/swagger.json` |
| Go + swaggo | `/swagger/doc.json` |
| Go + go-restful | `/apidocs.json` |
| Rust + utoipa | `/api-doc/openapi.json` |
| Node.js + swagger-jsdoc | `/api-docs` |
| Node.js + NestJS | `/api` or `/api-json` |
| Ruby on Rails + rswag | `/api-docs/v1/swagger.yaml` |
| Hono (TypeScript) | `/doc` |
| Gin (Go) | `/swagger/index.html` (JSON at `/swagger/doc.json`) |

---

*Generated from the KumaGen OpenAPI discovery implementation — `server/openapi.js`*
