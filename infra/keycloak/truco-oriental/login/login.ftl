<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<#import "buttons.ftl" as buttons>
<#import "social-providers.ftl" as identityProviders>
<#import "passkeys.ftl" as passkeys>
<#assign hasProviders = realm.password && (social.providers)?has_content>
<#-- La verificación de una cuenta existente usa este mismo formulario y marca registrationDisabled. -->
<#assign socialFirst = hasProviders && !registrationDisabled?? && !usernameHidden?? && !enableWebAuthnConditionalUI?has_content>
<#assign invalidCredentials = messagesPerField.existsError('username', 'password')>
<@layout.registrationLayout displayMessage=!invalidCredentials displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>
    <#if section = "header">
        ${msg(socialFirst?then("trucoSocialTitle", "loginAccountTitle"))}
    <#elseif section = "form">
        <#if socialFirst>
            <div class="truco-social">
                <p id="truco-social-intro">${msg("trucoSocialIntro")}</p>
                <@identityProviders.show social=social />
            </div>
            <details id="truco-existing-account"<#if invalidCredentials || (message?has_content && message.type == "error")> open</#if>>
                <summary>${msg("trucoExistingPassword")}</summary>
        </#if>
        <div id="kc-form">
            <div id="kc-form-wrapper">
                <#if realm.password>
                    <form id="kc-form-login" class="${properties.kcFormClass!}" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post" novalidate="novalidate">
                        <#if !usernameHidden??>
                            <#assign label>
                                <#if !realm.loginWithEmailAllowed>${msg("username")}<#else>${msg("usernameOrEmail")}</#if>
                            </#assign>
                            <@field.input name="username" label=label error=messagesPerField.getFirstError('username','password')
                                autofocus=(!socialFirst || invalidCredentials) autocomplete="${(enableWebAuthnConditionalUI?has_content)?then('username webauthn', 'username')}" value=login.username!'' />
                        </#if>
                        <@field.password name="password" label=msg("password") error=(usernameHidden??)?then(messagesPerField.get('password'), '') forgotPassword=realm.resetPasswordAllowed autofocus=usernameHidden?? autocomplete="current-password">
                            <#if realm.rememberMe && !usernameHidden??>
                                <@field.checkbox name="rememberMe" label=msg("rememberMe") value=login.rememberMe?? />
                            </#if>
                        </@field.password>
                        <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>
                        <@buttons.loginButton />
                    </form>
                </#if>
            </div>
        </div>
        <#if socialFirst></details></#if>
        <@passkeys.conditionalUIData />
    <#elseif section = "socialProviders">
        <#if hasProviders && !socialFirst>
            <@identityProviders.show social=social />
        </#if>
    <#elseif section = "info">
        <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
            <div id="kc-registration-container">
                <div id="kc-registration">
                    <span>${msg("noAccount")} <a href="${url.registrationUrl}">${msg("doRegister")}</a></span>
                </div>
            </div>
        </#if>
    </#if>
</@layout.registrationLayout>
