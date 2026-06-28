FROM golang:1.26.4-alpine3.23
WORKDIR /app

# Install Air for hot reload
RUN go install github.com/air-verse/air@latest

# Install Delve for debugging
RUN go install github.com/go-delve/delve/cmd/dlv@latest

RUN apk update && apk add ffmpeg gcc musl-dev

# Copy dependency files and install modules
COPY go.* ./
RUN go mod download

# Copy the entire project
COPY . .

# Expose port 3000
EXPOSE 3000

# Start the app with Air
CMD [ "air", "-c", ".air.toml" ]
