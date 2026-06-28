FROM golang:1.26.4-alpine3.23 AS builder
WORKDIR /app

# Copy dependency files and install modules
COPY go.* ./
RUN go mod download

# Copy the entire project
COPY . .

RUN apk update && apk add gcc musl-dev

ENV CGO_ENABLED=0

RUN mkdir -p dist && go build  -o ./dist/main .

FROM alpine:3.24 AS runner

WORKDIR /app

COPY --from=builder /app/dist/main /app/dist/main

RUN apk add --no-cache ffmpeg

EXPOSE 3000

CMD [ "./dist/main" ]
