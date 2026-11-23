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
COPY infra/keycloak/truco-oriental /opt/keycloak/themes/truco-oriental
COPY public/favicon.svg /opt/keycloak/themes/truco-oriental/login/resources/img/favicon.svg
COPY public/favicon.svg /opt/keycloak/themes/truco-oriental/account/resources/img/favicon.svg
