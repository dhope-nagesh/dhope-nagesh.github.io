---
layout: post
title: "Designing gRPC Microservices in Go: Patterns and Pitfalls"
date: 2025-12-10
tags: [Go, Microservices]
read_time: 12
excerpt: "Lessons learned from building gRPC-based microservices at scale — covering service design, error handling, interceptors, and observability."
---

After building several gRPC microservices at EnterpriseDB for cluster provisioning, tagging, and notification systems, I've gathered a set of patterns (and pitfalls) that I wish I'd known from the start. This post covers the practical aspects of designing gRPC services in Go.

## Why gRPC?

REST is the default choice for many teams, but gRPC offers compelling advantages for internal service-to-service communication:

- **Strong typing** — Protobuf schemas enforce contracts at compile time
- **Performance** — Binary serialization + HTTP/2 multiplexing
- **Code generation** — Auto-generated clients in any language
- **Streaming** — Built-in support for server, client, and bidirectional streaming
- **Deadlines** — First-class support for request timeouts that propagate across services

## Protobuf Design Principles

Your `.proto` files are the API contract. Design them carefully:

```protobuf
syntax = "proto3";
package cluster.v1;

option go_package = "github.com/example/api/cluster/v1;clusterv1";

service ClusterService {
  rpc CreateCluster(CreateClusterRequest) returns (CreateClusterResponse);
  rpc GetCluster(GetClusterRequest) returns (GetClusterResponse);
  rpc ListClusters(ListClustersRequest) returns (ListClustersResponse);
  rpc DeleteCluster(DeleteClusterRequest) returns (DeleteClusterResponse);
}

message CreateClusterRequest {
  string name = 1;
  string engine_version = 2;
  int32 replicas = 3;
  string region = 4;
  map<string, string> labels = 5;
}

message CreateClusterResponse {
  Cluster cluster = 1;
}
```

Key design rules:

1. **Use request/response wrappers** — Even for single-field RPCs, always use a message wrapper. This lets you add fields later without breaking the API.
2. **Version your packages** — Use `v1`, `v2` etc. so you can evolve APIs without breaking consumers.
3. **Prefer specific field types** — Use `google.protobuf.Timestamp` for times, `google.protobuf.Duration` for durations, not strings.

## Server Structure

Here's how I typically structure a gRPC service in Go:

```go
type ClusterServer struct {
    clusterv1.UnimplementedClusterServiceServer
    store   store.ClusterStore
    logger  *slog.Logger
}

func NewClusterServer(store store.ClusterStore, logger *slog.Logger) *ClusterServer {
    return &ClusterServer{
        store:  store,
        logger: logger,
    }
}

func (s *ClusterServer) CreateCluster(
    ctx context.Context,
    req *clusterv1.CreateClusterRequest,
) (*clusterv1.CreateClusterResponse, error) {
    // 1. Validate
    if req.GetName() == "" {
        return nil, status.Error(codes.InvalidArgument, "name is required")
    }

    // 2. Execute business logic
    cluster, err := s.store.Create(ctx, req)
    if err != nil {
        if errors.Is(err, store.ErrAlreadyExists) {
            return nil, status.Error(codes.AlreadyExists, "cluster already exists")
        }
        return nil, status.Error(codes.Internal, "failed to create cluster")
    }

    // 3. Return response
    return &clusterv1.CreateClusterResponse{
        Cluster: toProto(cluster),
    }, nil
}
```

Always embed `Unimplemented*Server` — it ensures forward compatibility when you add new RPCs.

## Error Handling Done Right

gRPC has a well-defined set of status codes. Use them correctly:

| Code | When to Use |
|------|------------|
| `InvalidArgument` | Bad input from client |
| `NotFound` | Resource doesn't exist |
| `AlreadyExists` | Duplicate creation attempt |
| `PermissionDenied` | Auth succeeded but unauthorized |
| `Unauthenticated` | Missing or invalid credentials |
| `Internal` | Unexpected server error |
| `Unavailable` | Transient failure, client should retry |

For richer errors, use `errdetails`:

```go
st := status.New(codes.InvalidArgument, "invalid request")
st, _ = st.WithDetails(&errdetails.BadRequest{
    FieldViolations: []*errdetails.BadRequest_FieldViolation{
        {Field: "replicas", Description: "must be between 1 and 5"},
    },
})
return nil, st.Err()
```

## Interceptors for Cross-Cutting Concerns

Interceptors (middleware) keep your handlers clean. Here's a typical stack:

```go
server := grpc.NewServer(
    grpc.ChainUnaryInterceptor(
        // Recovery from panics
        recovery.UnaryServerInterceptor(),
        // Request logging
        logging.UnaryServerInterceptor(logger),
        // Prometheus metrics
        grpcprom.UnaryServerInterceptor,
        // Request validation
        validator.UnaryServerInterceptor(),
        // Auth
        auth.UnaryServerInterceptor(authFunc),
    ),
)
```

The [grpc-ecosystem/go-grpc-middleware](https://github.com/grpc-ecosystem/go-grpc-middleware) library provides battle-tested interceptors for most common needs.

## Observability

For production services, you need three pillars:

### Metrics (Prometheus)

```go
grpcprom := grpcprometheus.NewServerMetrics(
    grpcprometheus.WithServerHandlingTimeHistogram(),
)
grpcprom.InitializeMetrics(server)
```

This gives you request rate, error rate, and latency histograms — per method.

### Tracing (OpenTelemetry)

```go
server := grpc.NewServer(
    grpc.StatsHandler(otelgrpc.NewServerHandler()),
)
```

Distributed tracing across gRPC calls lets you see the full request path through your microservices.

### Structured Logging

```go
func loggingInterceptor(logger *slog.Logger) grpc.UnaryServerInterceptor {
    return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
        start := time.Now()
        resp, err := handler(ctx, req)
        logger.InfoContext(ctx, "gRPC call",
            "method", info.FullMethod,
            "duration", time.Since(start),
            "code", status.Code(err).String(),
        )
        return resp, err
    }
}
```

## Common Pitfalls

1. **Not propagating deadlines** — Always pass the `ctx` from the incoming request to downstream calls. gRPC deadlines propagate automatically through context.

2. **Ignoring connection management** — Use connection pooling on the client side. A single `grpc.ClientConn` multiplexes over HTTP/2, but if you need higher throughput, use a pool.

3. **Large messages** — gRPC has a default 4MB message limit. If you need to transfer large data, use streaming or bump the limit explicitly.

4. **Missing health checks** — Implement the [gRPC Health Checking Protocol](https://github.com/grpc/grpc/blob/master/doc/health-checking.md) for Kubernetes readiness/liveness probes.

5. **Not using reflection in development** — Register the reflection service so tools like `grpcurl` and `grpcui` work out of the box.

## Wrapping Up

gRPC with Go is a powerful combination for building internal microservices. Invest in your proto design (it's your API), leverage interceptors for cross-cutting concerns, and prioritize observability from day one. The upfront investment in strong typing and code generation pays dividends as your service mesh grows.
