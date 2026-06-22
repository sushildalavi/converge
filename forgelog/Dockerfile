FROM golang:1.23-alpine AS build

WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
RUN go build -o /out/forgelog ./cmd/forgelog

FROM alpine:3.20
WORKDIR /app
COPY --from=build /out/forgelog /usr/local/bin/forgelog
EXPOSE 9090
ENTRYPOINT ["/usr/local/bin/forgelog"]
