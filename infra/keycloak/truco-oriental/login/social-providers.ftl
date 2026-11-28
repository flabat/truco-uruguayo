<#-- Copia de keycloak.v2/login/social-providers.ftl (Keycloak 26.8.2, Apache-2.0) con la lista fija. -->
<#import "divider.ftl" as divider>
<#macro show social>
  <#-- El Truco: siempre en lista, con «Continuar con …», aunque haya más de tres proveedores. -->
  <#assign useGrid = false>
  <@divider.or text=msg(useGrid?then("identity-provider-login-label-divider", "orLabel")) />
  <div id="kc-social-providers" class="${properties.kcFormSocialAccountSectionClass!}">
      <ul class="${properties.kcFormSocialAccountListClass!} <#if useGrid>${properties.kcFormSocialAccountListGridClass!}</#if>">
          <#list social.providers as p>
              <#-- El Truco: Apple admite solo «Continuar con Apple» (o «Sign in…», «Sign up…»), aunque cambie el nombre visible. -->
              <#assign apple = p.providerId == "apple">
              <#assign etiqueta = apple?then(msg("trucoContinuarConApple"), msg("signInWithProvider", p.displayName!))>
              <li class="<#if useGrid>${properties.kcFormSocialAccountGridItem!}<#else>${properties.kcFormSocialAccountListItemClass!}</#if>">
                  <a data-once-link data-disabled-class="${properties.kcFormSocialAccountListButtonDisabledClass!}" id="social-${p.alias}"
                          class="${properties.kcFormSocialAccountListButtonClass!}<#if apple> truco-apple</#if>" aria-label="<#if useGrid>${p.displayName!}<#else>${etiqueta}</#if>"
                          type="button" href="${p.loginUrl}">
                        <#-- La extensión de Apple trae iconClasses «fa fa-apple»: el tema no carga Font Awesome y Apple usa su logo. -->
                        <#if p.iconClasses?has_content && !apple>
                            <span class="${p.iconClasses!}">
                                <#if useGrid>
                                    ${p.displayName!}
                                <#else>
                                    ${etiqueta}
                                </#if>
                            </span>
                        <#else>
                        <#switch p.providerId>
                            <#-- El Truco: logo oficial de Apple Design Resources (lo baja infra/keycloak/Dockerfile), blanco sobre el botón negro y negro sobre el blanco. -->
                            <#case "apple">
                                <img class="truco-apple-claro" src="${url.resourcesPath}/img/social/apple-blanco.svg" aria-hidden="true" alt="">
                                <img class="truco-apple-oscuro" src="${url.resourcesPath}/img/social/apple-negro.svg" aria-hidden="true" alt="">
                                <#break>
                            <#case "github">
                            <#case "instagram">
                            <#case "twitter">
                                <#if darkMode>
                                    <picture>
                                        <source srcset="${url.resourcesPath}/img/social/${p.providerId}-light.svg" media="(prefers-color-scheme: dark)">
                                        <img src="${url.resourcesPath}/img/social/${p.providerId}.svg" aria-hidden="true" alt="">
                                    </picture>
                                <#else>
                                    <img src="${url.resourcesPath}/img/social/${p.providerId}.svg" aria-hidden="true" alt="">
                                </#if>
                                <#break>
                            <#case "google">
                            <#case "facebook">
                            <#case "gitlab">
                            <#case "linkedin-openid-connect">
                            <#case "microsoft">
                            <#case "bitbucket">
                            <#case "stackoverflow">
                            <#case "paypal">
                            <#case "openshift-v4">
                                <img src="${url.resourcesPath}/img/social/${p.providerId}.svg" aria-hidden="true" alt="">
                                <#break>
                            <#default>
                                <#if darkMode>
                                    <picture>
                                        <source srcset="${url.resourcesPath}/img/social/default-light.svg" media="(prefers-color-scheme: dark)">
                                        <img src="${url.resourcesPath}/img/social/default.svg" aria-hidden="true" alt="">
                                    </picture>
                                <#else>
                                    <img src="${url.resourcesPath}/img/social/default.svg" aria-hidden="true" alt="">
                                </#if>
                        </#switch>
                            <span class="${properties.kcFormSocialAccountNameClass!}"><#if useGrid>${p.displayName!}<#else>${etiqueta}</#if></span>
                        </#if>
                  </a>
              </li>
          </#list>
      </ul>
  </div>
</#macro>