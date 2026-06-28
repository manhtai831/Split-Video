local:
	ln -s .docker/local/Dockerfile Dockerfile | true
	ln -s .docker/local/docker-compose.yml docker-compose.yml | true
	docker compose up -d --build

prod:
	ln -s .docker/prod/Dockerfile Dockerfile | true
	ln -s .docker/prod/docker-compose.yml docker-compose.yml | true
	docker compose up -d --build
