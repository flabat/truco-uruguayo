FROM quay.io/keycloak/keycloak:26.8.2 AS keycloak

FROM eclipse-temurin:21-jdk AS compilacion
WORKDIR /compilacion
COPY --from=keycloak /opt/keycloak/lib/lib/main/ /keycloak/
COPY infra/keycloak/proveedor/ proveedor/
RUN mkdir clases && \
    javac -cp '/keycloak/*' -d clases proveedor/org/trucooriental/VerificarCorreo.java && \
    jar --create --file /truco-verificar-correo.jar -C clases . -C proveedor META-INF

# Logo oficial de Sign in with Apple (Apple Design Resources), en versión y suma fijas. La licencia de Apple
# permite usarlo en la interfaz de la app y de su versión web, no redistribuirlo suelto: por eso no está en
# el repositorio. Si Apple cambia el .dmg, la construcción falla: revisá el logo nuevo y actualizá las sumas
# de este ADD y de logo-apple.sha256.
FROM node:24-bookworm-slim AS logo-apple
RUN apt-get update && apt-get install -y --no-install-recommends 7zip && rm -rf /var/lib/apt/lists/*
ADD --checksum=sha256:99fba5c8a294a86653294b3766d7ce21dde47cc75a77367659c45ea168699af6 \
  https://devimages-cdn.apple.com/design/resources/download/Logo-Sign-in-with-Apple.dmg /logo-apple.dmg
WORKDIR /logo
COPY infra/keycloak/logo-apple.sha256 .
# Logo alineado a la izquierda, tamaño mediano: blanco para el botón negro y negro para el botón blanco.
RUN origen='Logo-Sign-in-with-Apple/Sign in with Apple - Left Aligned/SVG/Logo - SIWA - Left-aligned' && \
    7zz e -bd /logo-apple.dmg "$origen - White - Medium.svg" "$origen - Black - Medium.svg" >/dev/null && \
    mv 'Logo - SIWA - Left-aligned - White - Medium.svg' apple-blanco.svg && \
    mv 'Logo - SIWA - Left-aligned - Black - Medium.svg' apple-negro.svg && \
    sha256sum -c logo-apple.sha256 && \
    chmod 644 apple-blanco.svg apple-negro.svg

FROM keycloak
COPY --from=compilacion /truco-verificar-correo.jar /opt/keycloak/providers/
# Sign in with Apple: extensión comunitaria (Apache-2.0) en versión y suma fijas. Compatible con Keycloak >= 26.5.
ADD --checksum=sha256:4091dee2a1ec9e0771bef4bd46005197d86b0a2b1f25198c41738476b1d102bb --chmod=644 \
  https://github.com/klausbetz/apple-identity-provider-keycloak/releases/download/1.17.0/apple-identity-provider-1.17.0.jar \
  /opt/keycloak/providers/apple-identity-provider-1.17.0.jar
COPY infra/keycloak/truco-oriental /opt/keycloak/themes/truco-oriental
COPY --from=logo-apple /logo/apple-blanco.svg /logo/apple-negro.svg /opt/keycloak/themes/truco-oriental/login/resources/img/social/
COPY public/favicon.svg /opt/keycloak/themes/truco-oriental/login/resources/img/favicon.svg
COPY public/favicon.svg /opt/keycloak/themes/truco-oriental/account/resources/img/favicon.svg
