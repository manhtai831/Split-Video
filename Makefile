local:
	ln -sf .docker/local/Dockerfile Dockerfile
	ln -sf .docker/local/docker-compose.yml docker-compose.yml
	docker compose up -d --build

prod:
	ln -sf .docker/prod/Dockerfile Dockerfile
	ln -sf .docker/prod/docker-compose.yml docker-compose.yml
	docker compose up -d --build
