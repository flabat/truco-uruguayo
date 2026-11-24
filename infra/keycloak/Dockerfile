FROM quay.io/keycloak/keycloak:26.8.2 AS keycloak

FROM eclipse-temurin:21-jdk AS compilacion
WORKDIR /compilacion
COPY --from=keycloak /opt/keycloak/lib/lib/main/ /keycloak/
COPY infra/keycloak/proveedor/ proveedor/
RUN mkdir clases && \
    javac -cp '/keycloak/*' -d clases proveedor/org/trucooriental/VerificarCorreo.java && \
    jar --create --file /truco-verificar-correo.jar -C clases . -C proveedor META-INF

FROM keycloak
COPY --from=compilacion /truco-verificar-correo.jar /opt/keycloak/providers/
# Sign in with Apple: extensión comunitaria (Apache-2.0) en versión y suma fijas. Compatible con Keycloak >= 26.5.
ADD --checksum=sha256:4091dee2a1ec9e0771bef4bd46005197d86b0a2b1f25198c41738476b1d102bb --chmod=644 \
  https://github.com/klausbetz/apple-identity-provider-keycloak/releases/download/1.17.0/apple-identity-provider-1.17.0.jar \
  /opt/keycloak/providers/apple-identity-provider-1.17.0.jar
COPY infra/keycloak/truco-oriental /opt/keycloak/themes/truco-oriental
COPY public/favicon.svg /opt/keycloak/themes/truco-oriental/login/resources/img/favicon.svg
COPY public/favicon.svg /opt/keycloak/themes/truco-oriental/account/resources/img/favicon.svg
