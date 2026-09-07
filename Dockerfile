# House of Esther backend — staging container image.
# Runs the Clojure API straight from tools-deps (no uberjar step); migrations
# apply on startup (RUN_MIGRATIONS_ON_START=true). Application source is NOT
# modified by this file.

FROM clojure:temurin-21-tools-deps-bookworm-slim AS deps
WORKDIR /app
COPY deps.edn ./
# Pre-fetch the dependency graph for both the run and seed classpaths so the
# final image starts without touching the network.
RUN clojure -P -M:run && clojure -P -X:seed

FROM clojure:temurin-21-tools-deps-bookworm-slim
WORKDIR /app
ENV CLJ_CONFIG=/app/.clojure
COPY --from=deps /root/.m2 /root/.m2
COPY deps.edn ./
COPY resources ./resources
COPY src ./src

# Jetty listens on $PORT (fly.toml sets it to 8080).
ENV PORT=8080
EXPOSE 8080

CMD ["clojure", "-M:run"]
