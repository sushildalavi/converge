FROM golang:1.23-alpine AS build

WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
RUN go build -o /out/event_backend ./cmd/event_backend

FROM alpine:3.20
WORKDIR /app
COPY --from=build /out/event_backend /usr/local/bin/event_backend
EXPOSE 9090
ENTRYPOINT ["/usr/local/bin/event_backend"]
