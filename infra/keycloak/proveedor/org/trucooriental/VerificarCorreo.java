package org.trucooriental;

import org.keycloak.authentication.RequiredActionContext;
import org.keycloak.authentication.authenticators.broker.AbstractIdpAuthenticator;
import org.keycloak.authentication.requiredactions.VerifyEmail;
import org.keycloak.events.Details;
import org.keycloak.models.Constants;
import org.keycloak.services.managers.AuthenticationManager;
import org.keycloak.services.resources.IdentityBrokerService;
import org.keycloak.sessions.AuthenticationSessionModel;

public final class VerificarCorreo extends VerifyEmail {
    @Override
    public int order() {
        return 1;
    }

    @Override
    public void evaluateTriggers(RequiredActionContext context) {
        if (!esRegresoSocial(context)) {
            super.evaluateTriggers(context);
        }
    }

    @Override
    public void requiredActionChallenge(RequiredActionContext context) {
        if (esRegresoSocial(context)) {
            // Omite una verificación pendiente solo en esta sesión. Keycloak conserva el estado de la cuenta.
            context.ignore();
        } else {
            super.requiredActionChallenge(context);
        }
    }

    private boolean esRegresoSocial(RequiredActionContext context) {
        AuthenticationSessionModel session = context.getAuthenticationSession();
        String realm = context.getRealm().getName();
        if ((!"mesa".equals(realm) && !"mesa-local".equals(realm))
                || !"truco-web".equals(session.getClient().getClientId())
                || context.getUser().isEmailVerified()) {
            return false;
        }

        // IdentityBrokerService deja esta nota al terminar un ingreso con el broker.
        // El primer ingreso y la vinculación usan notas de autenticación propias.
        String proveedor = session.getUserSessionNotes().get(Details.IDENTITY_PROVIDER);
        return ("google".equals(proveedor) || "facebook".equals(proveedor))
                && session.getAuthNote(AbstractIdpAuthenticator.FIRST_BROKER_LOGIN_SUCCESS) == null
                && session.getAuthNote(AbstractIdpAuthenticator.BROKERED_CONTEXT_NOTE) == null
                && session.getAuthNote(IdentityBrokerService.LINKING_IDENTITY_PROVIDER) == null
                && session.getAuthNote(AuthenticationManager.NEW_USER_REGISTERED) == null
                && session.getAuthNote(Constants.VERIFY_EMAIL_KEY) == null
                && session.getClientNote(Constants.KC_ACTION) == null
                && !session.getRequiredActions().contains(getId());
    }
}
