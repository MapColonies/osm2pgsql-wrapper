FROM ubuntu:20.04 as build

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get -y update && apt -y install \
  make \
  cmake \
  g++ \
  libboost-dev \
  libboost-system-dev \
  libboost-filesystem-dev \
  libexpat1-dev \
  zlib1g-dev \
  libbz2-dev \
  libpq-dev \
  libproj-dev \
  lua5.3 \
  liblua5.3-dev \
  pandoc \
  git-core \
  libboost-program-options-dev

RUN git clone git://github.com/openstreetmap/osm2pgsql.git && \
  cd osm2pgsql && \
  mkdir build && \
  cd build && \
  cmake .. && \
  make && \
  make install

RUN git clone https://github.com/osmcode/osmium-tool && \
  git clone https://github.com/mapbox/protozero && \
  git clone https://github.com/osmcode/libosmium && \
  cd osmium-tool && \
  mkdir build && \
  cd build && \
  cmake .. && \
  make

FROM node:14 as buildApp

WORKDIR /tmp/buildApp

COPY ./package*.json ./

RUN npm install
COPY . .
RUN npm run build

FROM ubuntu:20.04 as production

ENV DEBIAN_FRONTEND=noninteractive
ENV workdir /app
ARG NODE_VERSION=14.x

WORKDIR ${workdir}

COPY --from=build /osm2pgsql/build /osm2pgsql
COPY --from=build /osmium-tool/build /osmium-tool/build
RUN ln -s /osm2pgsql/osm2pgsql /bin/osm2pgsql && ln -s /osmium-tool/build/osmium /bin/osmium

RUN apt-get update \
    && apt-get -yq install curl \
    && curl -L https://deb.nodesource.com/setup_${NODE_VERSION} | bash \
    && apt-get -yq install nodejs libboost-filesystem-dev libpq-dev libproj-dev liblua5.3-dev libboost-program-options-dev

COPY ./package*.json ./

RUN npm ci --only=production

COPY --from=buildApp /tmp/buildApp/dist .
COPY ./config ./config
COPY start.sh .

RUN chgrp root ${workdir}/start.sh && chmod -R a+rwx ${workdir} && \
    mkdir /.postgresql && chmod g+w /.postgresql

# uncomment while developing to make sure the docker runs on openshift
RUN useradd -ms /bin/bash user && usermod -a -G root user
USER user

CMD ./start.sh
