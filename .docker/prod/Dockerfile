FROM golang:1.26.4-alpine3.23 AS builder
WORKDIR /app

RUN apk update && apk add gcc musl-dev

# Copy dependency files and install modules
COPY go.* ./
RUN go mod download

ENV CGO_ENABLED=1

# Copy the entire project
COPY . .

RUN go run ./cmd/assetbuild prod
RUN mkdir -p dist && go build -o ./dist/main . && go build -o ./dist/ytdlp-updater ./cmd/ytdlp-updater

FROM alpine:3.24 AS runner

WORKDIR /app

RUN apk add ffmpeg python3 ca-certificates

COPY --from=builder /app/dist/main ./dist/main
COPY --from=builder /app/dist/ytdlp-updater /usr/local/bin/ytdlp-updater
COPY --from=builder /app/dist/static ./dist/static
COPY templates ./templates

RUN ytdlp-updater

EXPOSE 3000

CMD [ "./dist/main" ]
