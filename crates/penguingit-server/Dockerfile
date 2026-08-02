FROM rust:1.88-slim as builder

WORKDIR /app
COPY . .

RUN cargo build --release -p penguingit-server

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/penguingit-server /app/penguingit-server
COPY --from=builder /app/crates/penguingit-server/migrations /app/migrations

ENV PORT=3000
EXPOSE 3000

CMD ["/app/penguingit-server"]
