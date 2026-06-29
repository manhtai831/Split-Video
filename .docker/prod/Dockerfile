FROM golang:1.26.4-alpine3.23 AS builder
WORKDIR /app

RUN apk update && apk add gcc musl-dev

# Copy dependency files and install modules
COPY go.* ./
RUN go mod download

ENV CGO_ENABLED=1

# Copy the entire project
COPY . .

RUN mkdir -p dist && go build  -o ./dist/main .

FROM alpine:3.24 AS runner

WORKDIR /app

COPY --from=builder /app/dist/main /app/dist/main
COPY templates ./templates
COPY public ./public

RUN apk add ffmpeg

EXPOSE 3000

CMD [ "./dist/main" ]
