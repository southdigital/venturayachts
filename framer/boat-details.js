import * as React from "react"
import { addPropertyControls, ControlType, useLocaleInfo } from "framer"

type VideoItem = {
    url?: string
    title?: string
    description?: string
    thumbnail?: string
    type?: string
    subtype?: string
}

type BoatData = {
    boat_id?: string
    yachtworld_id?: string
    make?: string
    model?: string
    year?: number | string
    price?: number
    price_gbp?: string
    price_eur?: string
    price_usd?: string
    price_title?: string
    price_currency?: string
    length_metre?: number | string
    length_feet?: number | string
    number_of_cabins_num?: number | string
    number_of_cabins?: string
    tax_status?: string
    max_speed?: string
    number_of_passengers?: string
    location?: string
    description?: string
    engine_make?: string
    engine_model?: string
    engine_fuel_type?: string
    engine_power?: string
    engine_power_unit?: string
    main_image?: string
    image?: string[]
    videos?: VideoItem[]
    feed?: string
}

type ApiResponse = {
    meta?: any
    data?: BoatData
}

function cssText(props: any) {
    return `
.boat-detail-component{
  width:100%;
  box-sizing:border-box;
  color:${props.textColor};
  font-family:${props.bodyFont?.fontFamily || "Bell Gothic Std Light, sans-serif"};
}
.boat-detail-component *{
  box-sizing:border-box;
}
.boat-detail-component img{
  display:block;
  max-width:100%;
}
.boat-detail-component button{
  font:inherit;
}
.boat-detail-component a{
  color:inherit;
  text-decoration:none;
}

/* Shared structure */
.boat-detail-component .section-container{
  width:100%;
}
.boat-detail-component .section-wrapper{
  width:100%;
  max-width:${props.wrapperMaxWidth}px;
  margin:0 auto;
  padding-left:${props.sidePadding}px;
  padding-right:${props.sidePadding}px;
}
.boat-detail-component .section-title{
  margin:0;
  font-family:${props.headingFont?.fontFamily || "Sohne, Arial, sans-serif"};
  font-size:${props.sectionTitleSize}px;
  font-weight:${props.headingFont?.fontWeight || 500};
  line-height:1.05;
  letter-spacing:${props.headingLetterSpacing}em;
  text-transform:uppercase;
  color:${props.accentColor};
}
.boat-detail-component .loading-wrap,
.boat-detail-component .error-wrap,
.boat-detail-component .empty-wrap{
  width:100%;
  min-height:240px;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  padding:40px 20px;
  text-align:center;
  gap:16px;
  margin-top:40px;
}
.boat-detail-component .loading-text,
.boat-detail-component .error-text,
.boat-detail-component .empty-text{
  font-family:${props.bodyFont?.fontFamily || "Bell Gothic Std Light, sans-serif"};
  font-size:16px;
  line-height:1.5;
  color:${props.textColor};
}
.boat-detail-component .spinner{
  width:48px;
  height:48px;
  border-radius:999px;
  border:3px solid rgba(0,0,0,0.08);
  border-top-color:${props.accentColor};
  animation:boat-detail-spin .9s linear infinite;
  display:block;
  margin:0 auto 16px auto;
}
@keyframes boat-detail-spin{
  from{ transform:rotate(0deg); }
  to{ transform:rotate(360deg); }
}

/* ===== Unavailable / sold state ===== */
.boat-detail-component .state-screen{
  position:relative;
  width:100%;
  min-height:${props.unavailableMinHeight}px;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:80px 24px;
  overflow:hidden;
  background:${props.unavailableBg};
}
.boat-detail-component .state-bg{
  position:absolute;
  inset:0;
  background-size:cover;
  background-position:center center;
  transform:scale(1.01);
}
.boat-detail-component .state-overlay{
  position:absolute;
  inset:0;
  background:linear-gradient(to bottom, rgba(0,0,0,${props.unavailableOverlayTop}) 0%, rgba(0,0,0,${props.unavailableOverlayBottom}) 100%);
}
.boat-detail-component .state-card{
  position:relative;
  z-index:2;
  width:100%;
  max-width:730px;
  text-align:center;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:0;
  opacity:0;
  transform:translate3d(0, 14px, 0);
  animation:boat-state-in 620ms cubic-bezier(0.22, 1, 0.36, 1) 60ms forwards;
}
@keyframes boat-state-in{
  to{ opacity:1; transform:translate3d(0, 0, 0); }
}
.boat-detail-component .state-icon{
  width:74px;
  height:74px;
  border-radius:999px;
  display:flex;
  align-items:center;
  justify-content:center;
  border:1px solid ${props.unavailableTextColor}66;
  background:${props.unavailableTextColor}14;
  color:${props.unavailableTextColor};
  margin-bottom:6px;
}
.boat-detail-component .state-eyebrow{
  margin:0 0 ${props.unavailableEyebrowGap}px 0;
  font-family:"Bell Gothic Std Light", sans-serif;
  font-size:13px;
  font-weight:300;
  letter-spacing:0.2em;
  text-transform:uppercase;
  color:${props.unavailableEyebrowColor};
}
.boat-detail-component .state-title{
  margin:0 0 ${props.unavailableContentGap}px 0;
  font-family:"BlairMdITC TT Medium","BlairMdITC TT Medium Placeholder",sans-serif;
  font-size:34px;
  font-weight:500;
  line-height:1.05;
  letter-spacing:-0.03em;
  text-transform:uppercase;
  color:${props.unavailableTextColor};
}
.boat-detail-component .state-message{
  margin:0 0 ${props.unavailableContentGap}px 0;
  max-width:500px;
  font-family:"Bell Gothic Std Light", sans-serif;
  font-size:17px;
  font-weight:300;
  line-height:1.55;
  letter-spacing:${props.bodyLetterSpacing}em;
  color:${props.unavailableTextColor};
}
.boat-detail-component .state-actions{
  display:flex;
  flex-wrap:wrap;
  gap:${props.unavailableButtonGap}px;
  justify-content:center;
  margin-top:0;
}
.boat-detail-component .state-btn{
  padding:0 30px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  letter-spacing:${props.buttonLetterSpacing}em;
  line-height:1;
  text-transform:uppercase;
  cursor:pointer;
  text-decoration:none;
  transition:opacity 180ms ease, transform 180ms ease, background 180ms ease;
  padding-top: 14px;
  padding-bottom: 11.5px;
}
.boat-detail-component .state-btn:hover{
  transform:translateY(-1px);
  opacity:0.92;
}
.boat-detail-component .state-btn-primary{
  background:${props.unavailablePrimaryBg};
  color:${props.unavailablePrimaryTextColor};
  border:${props.unavailablePrimaryBorderWidth}px solid ${props.unavailablePrimaryBorderColor};
  border-radius:${props.unavailablePrimaryRadius}px;
  font-family:"Bell Gothic Std Light", sans-serif;
  font-size:14px;
  font-weight:300;
}
.boat-detail-component .state-btn-secondary{
  background:${props.unavailableSecondaryBg};
  color:${props.unavailableSecondaryTextColor};
  border:${props.unavailableSecondaryBorderWidth}px solid ${props.unavailableSecondaryBorderColor};
  border-radius:${props.unavailableSecondaryRadius}px;
  font-family:"Bell Gothic Std Light", sans-serif;
  font-size:14px;
  font-weight:300;
}
@media (prefers-reduced-motion: reduce){
  .boat-detail-component .state-card{
    animation:none !important;
    opacity:1 !important;
    transform:none !important;
  }
}
@media (max-width:767px){
  .boat-detail-component .state-screen{
    padding-top:120px;
    padding-bottom: 80px;
    padding-inline: 20px;
    min-height:${Math.max(360, props.unavailableMinHeight - 140)}px;
  }
  .boat-detail-component .state-actions{
    flex-direction:column;
    width:100%;
    max-width:320px;
  }
  .boat-detail-component .state-btn{
    width:100%;
  }
}

/* ===== Per-character "Text Effect" animation (matches Framer Text Effect:
         Per Character, Enter: opacity 0 / blur 10 / offset Y 10, Spring) ===== */
.boat-detail-component .hero-title-char,
.boat-detail-component .hero-subtitle-char{
  display:inline-block;
  opacity:0;
  transform:translate3d(0, 10px, 0);
  filter:blur(10px);
  will-change:transform, opacity, filter;
  /* Spring-like easing via a custom cubic-bezier with gentle overshoot feel.
     Framer's default spring (stiffness 100, damping 10, mass 1) settles in
     roughly 800-1000ms — we mirror that here. */
  transition:
    opacity 720ms cubic-bezier(0.22, 1.02, 0.36, 1),
    transform 820ms cubic-bezier(0.22, 1.12, 0.36, 1),
    filter 720ms cubic-bezier(0.22, 1.02, 0.36, 1);
}
.boat-detail-component .hero-title-char.is-in,
.boat-detail-component .hero-subtitle-char.is-in{
  opacity:1;
  transform:translate3d(0, 0, 0);
  filter:blur(0);
}
/* Preserve spaces between characters */
.boat-detail-component .hero-title-space,
.boat-detail-component .hero-subtitle-space{
  display:inline-block;
  white-space:pre;
}
@media (prefers-reduced-motion: reduce){
  .boat-detail-component .hero-title-char,
  .boat-detail-component .hero-subtitle-char{
    transition:none !important;
    opacity:1 !important;
    transform:none !important;
    filter:none !important;
  }
}

/* 1. Hero */
.boat-detail-component .hero-container{
  width:100%;
  background:${props.heroFallbackBg};
}
.boat-detail-component .hero-wrapper{
  width:100%;
  max-width:none;
  padding:0;
}
.boat-detail-component .hero{
  position:relative;
  width:100%;
  height:${props.heroHeight}px;
  overflow:hidden;
  background:${props.heroFallbackBg};
}
.boat-detail-component .hero-bg{
  position:absolute;
  inset:0;
  background-size:cover;
  background-position:center center;
  transform:scale(1.01);
}
.boat-detail-component .hero-overlay{
  position:absolute;
  inset:0;
  background:linear-gradient(to bottom, rgba(0,0,0,${props.heroOverlayTop}) 0%, rgba(0,0,0,${props.heroOverlayBottom}) 100%);
}
.boat-detail-component .hero-content{
  position:relative;
  z-index:2;
  width:100%;
  height:100%;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  text-align:center;
  padding:24px;
}
.boat-detail-component .hero-title{
  margin:0;
  color:${props.heroTextColor};
  font-family:"BlairMdITC TT Medium","BlairMdITC TT Medium Placeholder",sans-serif;
  font-size:${props.heroTitleSize}px;
  font-weight:${props.headingFont?.fontWeight || 500};
  line-height:0.95;
  letter-spacing:${props.heroTitleLetterSpacing}em;
  text-transform:uppercase;
}
.boat-detail-component .hero-subtitle{
  margin:14px 0 0 0;
  color:${props.heroTextColor};
  font-family:${props.bodyFont?.fontFamily || "Bell Gothic Std Light, sans-serif"};
  font-size:${props.heroSubtitleSize}px;
  font-weight:${props.bodyFont?.fontWeight || 300};
  line-height:1.3;
  letter-spacing:${props.bodyLetterSpacing}em;
  text-transform:uppercase;
}

/* 2. Breadcrumbs */
.boat-detail-component .breadcrumbs-container{
  background:${props.breadcrumbBg};
}
.boat-detail-component .breadcrumbs-wrapper{
  max-width:${props.breadcrumbMaxWidth}px;
}
.boat-detail-component .breadcrumbs{
  min-height:44px;
  display:flex;
  align-items:center;
  gap:10px;
  padding-top:10px;
  padding-bottom:10px;
  color:#343434;
  font-family:${props.bodyFont?.fontFamily || "Bell Gothic Std Light, sans-serif"};
  font-size:${props.breadcrumbSize}px;
  line-height:1;
}
.boat-detail-component .breadcrumbs a.breadcrumb-link{
  text-decoration:none;
  transition:text-decoration 180ms ease;
}
.boat-detail-component .breadcrumbs a.breadcrumb-link:hover{
  text-decoration:underline;
}
.boat-detail-component .breadcrumb-current{
  opacity:0.8;
}

/* 3. Intro / details */
.boat-detail-component .intro-container{
  background:${props.introBg};
  padding-top:${props.introTop}px;
  padding-bottom:${props.introBottom}px;
}
.boat-detail-component .intro-wrapper{
  max-width:${props.wrapperMaxWidth}px;
}
.boat-detail-component .intro-grid{
  display:grid;
  grid-template-columns:minmax(260px, 360px) minmax(0, 1fr);
  gap:${props.introGap}px;
  align-items:start;
}
.boat-detail-component .intro-left{
  display:flex;
  flex-direction:column;
  gap:20px;
}
.boat-detail-component .intro-heading{
  margin:0;
  color:${props.accentColor};
  font-family:${props.headingFont?.fontFamily || "Sohne, Arial, sans-serif"};
  font-size:${props.introHeadingSize}px;
  font-weight:${props.headingFont?.fontWeight || 500};
  line-height:1.05;
  letter-spacing:${props.headingLetterSpacing}em;
  text-transform:uppercase;
}
.boat-detail-component .details-list{
  display:flex;
  flex-direction:column;
  gap:4px;
}
.boat-detail-component .detail-line{
  margin:0;
  font-family:${props.bodyFont?.fontFamily || "Bell Gothic Std Light, sans-serif"};
  font-size:${props.bodySize}px;
  font-weight:${props.bodyFont?.fontWeight || 300};
  line-height:${props.bodyLineHeight};
  letter-spacing:${props.bodyLetterSpacing}em;
  color:${props.textColor};
}
.boat-detail-component .intro-button-row{
  display:flex;
  padding-top:10px;
}
.boat-detail-component .back-button{
  border:1px solid ${props.buttonBorderColor};
  color:${props.buttonTextColor};
  background:${props.buttonBg};
  border-radius:999px;
  min-height:46px;
  padding:0 20px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  font-family:${props.bodyFont?.fontFamily || "Bell Gothic Std Light, sans-serif"};
  font-size:${props.buttonSize}px;
  font-weight:${props.bodyFont?.fontWeight || 300};
  letter-spacing:${props.buttonLetterSpacing}em;
  line-height:1;
  text-transform:uppercase;
  cursor:pointer;
  transition:opacity 180ms ease, transform 180ms ease;
}
.boat-detail-component .back-button:hover{
  opacity:0.9;
}
.boat-detail-component .intro-right{
  min-width:0;
}
.boat-detail-component .description{
  font-family:${props.bodyFont?.fontFamily || "Bell Gothic Std Light, sans-serif"};
  font-size:${props.bodySize}px;
  font-weight:${props.bodyFont?.fontWeight || 300};
  line-height:${props.bodyLineHeight};
  letter-spacing:${props.bodyLetterSpacing}em;
  color:${props.textColor};
}
.boat-detail-component .description p{
  margin:0 0 24px 0;
}
.boat-detail-component .description p:last-child{
  margin-bottom:0;
}

/* 4. Video */
.boat-detail-component .video-container{
  background:${props.videoSectionBg};
  padding-top:${props.videoTop}px;
  padding-bottom:${props.videoBottom}px;
}
.boat-detail-component .video-wrapper{
  max-width:${props.videoMaxWidth}px;
}
.boat-detail-component .video-frame{
  position:relative;
  width:100%;
  overflow:hidden;
  background:#d9d9d9;
  aspect-ratio:${props.videoAspectX} / ${props.videoAspectY};
}
.boat-detail-component .video-frame video,
.boat-detail-component .video-frame iframe{
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  border:none;
  display:block;
}
.boat-detail-component .video-frame video{
  object-fit:cover;
  background:#000;
}
.boat-detail-component .video-caption{
  padding-top:14px;
  text-align:center;
  font-family:${props.bodyFont?.fontFamily || "Bell Gothic Std Light, sans-serif"};
  font-size:14px;
  letter-spacing:${props.bodyLetterSpacing}em;
  text-transform:uppercase;
  opacity:0.8;
}

/* 5. Gallery */
.boat-detail-component .gallery-container{
  background:${props.galleryBg};
  padding-top:${props.galleryTop}px;
  padding-bottom:${props.galleryBottom}px;
  overflow:hidden;
}
.boat-detail-component .gallery-wrapper{
  max-width:none;
  padding-left:0;
  padding-right:0;
}
.boat-detail-component .gallery-header{
  width:100%;
  max-width:1600px;
  margin:0 auto;
  padding:0 32px 40px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:20px;
}
.boat-detail-component .gallery-nav{
  display:flex;
  align-items:center;
  gap:10px;
}
.boat-detail-component .gallery-nav-btn{
  border:none;
  background:transparent;
  color:${props.accentColor};
  display:inline-flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  border-radius:999px;
  transition:opacity 180ms ease, transform 180ms ease;
  padding:0;
}
.boat-detail-component .gallery-nav-btn:hover{
  opacity:0.8;
}
.boat-detail-component .gallery-viewport{
  width:100%;
  overflow:hidden;
}
.boat-detail-component .gallery-track{
  display:flex;
  width:100%;
  transform:translate3d(calc(-1 * var(--gallery-index, 1) * ${props.gallerySlideWidthPercent}%), 0, 0);
  transition:transform 600ms ease;
  will-change:transform;
}
.boat-detail-component .gallery-slide{
  flex:0 0 ${props.gallerySlideWidthPercent}%;
  padding:0 ${props.gallerySlideGap / 2}px;
}
.boat-detail-component .gallery-card{
  position:relative;
  width:100%;
  overflow:hidden;
  background:#ddd;
  aspect-ratio:${props.galleryAspectX} / ${props.galleryAspectY};
}
.boat-detail-component .gallery-card img{
  width:100%;
  height:100%;
  object-fit:cover;
}
.boat-detail-component .gallery-card.is-side{
  opacity:${props.sideSlideOpacity};
}
.boat-detail-component .gallery-card.is-active{
  opacity:1;
}
.boat-detail-component .gallery-card::after{
  content:"";
  position:absolute;
  inset:0;
  background:linear-gradient(to bottom, rgba(0,0,0,0.02), rgba(0,0,0,0.08));
  pointer-events:none;
}

/* 6. Technical data */
.boat-detail-component .tech-container{
  background:${props.techBg};
  padding-top:${props.techTop}px;
  padding-bottom:${props.techBottom}px;
}
.boat-detail-component .tech-wrapper{
  max-width:${props.techMaxWidth}px;
}
.boat-detail-component .tech-toggle{
  width:100%;
  border:none;
  background:transparent;
  min-height:92px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:20px;
  cursor:pointer;
  text-align:left;
  border-bottom:1px solid #8c6e28;
}
.boat-detail-component .tech-toggle.is-open{
  border-bottom:none;
}
.boat-detail-component .tech-toggle-title{
  margin:0;
  font-family:"BlairMdITC TT Medium","BlairMdITC TT Medium Placeholder",sans-serif;
  font-size:24px;
  font-weight:500;
  line-height:1.05;
  letter-spacing:-0.04em;
  text-transform:uppercase;
  color:#8d6814;  
}
.boat-detail-component .tech-toggle-label{
  display:inline-flex;
  align-items:center;
  gap:10px;
  font-family:Bell Gothic Std Light, sans-serif;
  font-size:17px;
  font-weight:300;
  line-height:1.2em;
  letter-spacing:0em;
  text-transform:uppercase;
  color:${props.techOpenLabelColor};
  white-space:nowrap;
}
.boat-detail-component .tech-toggle.is-open .tech-toggle-label{
  color:${props.techCloseLabelColor};
}
.boat-detail-component .tech-panel{
  overflow:hidden;
  transition:max-height 320ms ease, opacity 320ms ease, padding-top 320ms ease;
  max-height:0;
  opacity:0;
  padding-top:0;
}
.boat-detail-component .tech-panel.open{
  max-height:2000px;
  opacity:1;
  padding-top:36px;
}
.boat-detail-component .tech-grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:26px 90px;
}
.boat-detail-component .tech-item{
  display:flex;
  flex-direction:column;
  gap:8px;
}
.boat-detail-component .tech-key{
  margin:0;
  font-family:${props.headingFont?.fontFamily || "Sohne, Arial, sans-serif"};
  font-size:${props.techKeySize}px;
  font-weight:${props.headingFont?.fontWeight || 500};
  line-height:1em;
  letter-spacing:0;
  text-transform:uppercase;
  color:${props.textColor};
}
.boat-detail-component .tech-value{
  margin:0;
  font-family:${props.bodyFont?.fontFamily || "Bell Gothic Std Light, sans-serif"};
  font-size:${props.bodySize}px;
  font-weight:${props.bodyFont?.fontWeight || 300};
  line-height:${props.bodyLineHeight};
  letter-spacing:${props.bodyLetterSpacing}em;
  color:${props.textColor};
}
.boat-detail-component .tech-footer-line{
  margin-top:44px;
  border-top:1px solid ${props.accentColor};
  opacity:0.7;
}
.section-container.breadcrumbs-container {
  position: sticky;
  top: 75px;
  z-index: 1;
}

/* Responsive */
@media (max-width: 991px){
  .boat-detail-component .hero-title{
    font-size:${Math.max(42, props.heroTitleSize - 22)}px;
  }
  .boat-detail-component .intro-grid{
    grid-template-columns:1fr;
    gap:34px;
  }
  .boat-detail-component .tech-grid{
    grid-template-columns:1fr 1fr;
    gap:24px 36px;
  }
}
@media (max-width: 767px){
  .boat-detail-component .hero{
    height:${Math.max(360, props.heroHeight - 100)}px;
  }
  .boat-detail-component .hero-title{
    font-size:${Math.max(34, props.heroTitleSize - 36)}px;
    line-height:1;
  }
  .boat-detail-component .hero-subtitle{
    font-size:${Math.max(11, props.heroSubtitleSize - 1)}px;
  }
  .boat-detail-component .section-title,
  .boat-detail-component .tech-toggle-title,
  .boat-detail-component .intro-heading{
    font-size:${Math.max(24, props.sectionTitleSize - 10)}px;
  }
  .boat-detail-component .gallery-header{
    padding-bottom:18px;
  }
  .boat-detail-component .gallery-slide{
    flex:0 0 100%;
    padding:0;
  }
  .boat-detail-component .gallery-track{
    transform:translate3d(calc(-1 * var(--gallery-mobile-index, 0) * 100%), 0, 0);
  }
  .boat-detail-component .tech-toggle{
    min-height:74px;
    padding:20px 18px;
    flex-direction:column;
  }
  .boat-detail-component .tech-grid{
    display:flex;
    flex-direction:column;
    gap:22px;
    align-items:center;
  }
  .boat-detail-component .tech-item{
    align-items:center;
  }
  .boat-detail-component .breadcrumbs{
    flex-wrap:wrap;
    row-gap:4px;
  }

  .boat-detail-component .gallery-card{
    aspect-ratio: 1.50367 / 1;
  }

  .boat-detail-component .tech-toggle-title{
    text-align:center;
  }
}
`
}

function injectStyle(id: string, css: string) {
    if (typeof document === "undefined") return

    let tag = document.getElementById(id) as HTMLStyleElement | null
    if (!tag) {
        tag = document.createElement("style")
        tag.id = id
        document.head.appendChild(tag)
    }

    if (tag.innerHTML !== css) {
        tag.innerHTML = css
    }
}

/**
 * Toggles a <meta name="robots" content="noindex,follow"> tag on/off.
 *
 * Framer code components run client-side and can't return an HTTP status,
 * so a truly retired listing can't emit a 301/410 from here (do that at the
 * routing / redirect layer once a boat is confirmed sold). As a fallback,
 * injecting noindex keeps dead listings from accumulating in search results.
 */
function setNoIndex(active: boolean) {
    if (typeof document === "undefined") return

    const id = "boat-detail-noindex"
    let tag = document.getElementById(id) as HTMLMetaElement | null

    if (active) {
        if (!tag) {
            tag = document.createElement("meta")
            tag.id = id
            tag.setAttribute("name", "robots")
            document.head.appendChild(tag)
        }
        tag.setAttribute("content", "noindex,follow")
    } else if (tag) {
        tag.parentNode?.removeChild(tag)
    }
}

/**
 * Decides whether the API returned a real boat or a "sold / not found"
 * placeholder record.
 *
 * The backend returns a non-null object even for missing boats (e.g.
 * boat_id: "No Results", price_title: "0", empty make/model/images), which is
 * why a plain `!boat` guard never fires and the fallback hero renders. We
 * detect the placeholder by looking for a sentinel id OR a record with no real
 * identity and no imagery.
 */
function isBoatUnavailable(boat: BoatData | null): boolean {
    if (!boat) return true

    const idText = String(boat.boat_id ?? "")
        .trim()
        .toLowerCase()

    const sentinelId =
        idText !== "" &&
        /(no\s*results?|not\s*found|unavailable|sold|deleted|n\/?a)/.test(
            idText
        )

    const hasIdentity = !!(
        (boat.make && String(boat.make).trim()) ||
        (boat.model && String(boat.model).trim())
    )

    const hasImages = !!(
        (boat.main_image && String(boat.main_image).trim()) ||
        (Array.isArray(boat.image) && boat.image.filter(Boolean).length > 0)
    )

    // Sentinel id is a hard signal. Otherwise: a record with neither a name
    // nor a single image is treated as "not a real listing".
    return sentinelId || (!hasIdentity && !hasImages)
}

function stripHtmlToParagraphs(html?: string): string[] {
    if (!html) return []

    if (typeof document === "undefined") {
        return [
            html
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim(),
        ].filter(Boolean)
    }

    const temp = document.createElement("div")
    temp.innerHTML = html

    const paragraphs = Array.from(temp.querySelectorAll("p"))
        .map((p) => (p.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)

    if (paragraphs.length) return paragraphs

    const fallback = (temp.textContent || "").replace(/\s+/g, " ").trim()
    return fallback ? [fallback] : []
}

function formatLengthMeters(value: any) {
    if (value === null || value === undefined || value === "") return ""
    const num = Number(value)
    if (Number.isNaN(num)) return String(value)
    return `${num.toFixed(2).replace(/\.00$/, "")}m`
}

function getYoutubeEmbed(url?: string) {
    if (!url) return ""

    try {
        const parsed = new URL(url)

        if (parsed.hostname.includes("youtube.com")) {
            const id = parsed.searchParams.get("v")
            return id ? `https://www.youtube.com/embed/${id}` : ""
        }

        if (parsed.hostname.includes("youtu.be")) {
            const id = parsed.pathname.replace("/", "")
            return id ? `https://www.youtube.com/embed/${id}` : ""
        }

        return ""
    } catch {
        return ""
    }
}

function isMp4(url?: string) {
    return !!url && /\.mp4($|\?)/i.test(url)
}

function getBoatIdFromUrl() {
    if (typeof window === "undefined") return ""

    try {
        const url = new URL(window.location.href)
        return url.searchParams.get("id")?.trim() || ""
    } catch {
        return ""
    }
}

function chevronIcon(open: boolean) {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            style={{
                transform: open ? "rotate(45deg)" : "rotate(-45deg)",
                transition: "transform 220ms ease",
            }}
        >
            <path
                d="M3 10H17"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
            />
            <path
                d="M10 3L17 10L10 17"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}

function anchorIcon() {
    return (
        <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <circle cx="12" cy="5" r="2.4" />
            <line x1="12" y1="7.4" x2="12" y2="21" />
            <line x1="7.5" y1="11" x2="16.5" y2="11" />
            <path d="M4.5 14.5a7.5 7.5 0 0 0 15 0" />
            <path d="M4.5 14.5H2.6M19.5 14.5h1.9" />
        </svg>
    )
}

function decodeHtmlEntity(value?: string) {
    if (!value) return ""
    if (typeof document === "undefined") return value

    const txt = document.createElement("textarea")
    txt.innerHTML = value
    return txt.value
}

/**
 * Returns true when a locale code/slug/name looks Spanish.
 * Mirrors the Home aria-label override so links and the aria-label
 * localize consistently.
 */
function isSpanishLocaleValue(value?: unknown): boolean {
    if (typeof value !== "string") return false
    const normalized = value.trim().toLowerCase()
    return (
        normalized.startsWith("es") ||
        normalized.includes("spanish") ||
        normalized.includes("español") ||
        normalized.includes("espanol")
    )
}

const useStyleInjectionEffect =
    (React as any).useInsertionEffect || React.useLayoutEffect

/**
 * Splits a string into an array of characters, preserving spaces.
 * Each non-space character becomes an animated span; spaces are rendered
 * as inert spans so layout/word-wrap remains natural.
 */
type CharToken = { char: string; isSpace: boolean }
function splitToChars(text: string): CharToken[] {
    if (!text) return []
    // Array.from handles surrogate pairs / emoji cleanly.
    return Array.from(text).map((ch) => ({
        char: ch,
        isSpace: ch === " " || ch === "\u00A0",
    }))
}

/**
 * Renders text with per-character entrance animation.
 *
 * Matches Framer's Text Effect settings shown in the editor:
 *   - Per: Character
 *   - Trigger: On Appear
 *   - Enter: opacity 0, scale 1, blur 10, offset Y 10
 *   - Transition: Spring
 *   - Delay: 0.6s (before first character starts)
 *
 * Each character reveals sequentially with a small per-character stagger,
 * and the CSS transition uses a spring-like cubic-bezier to mimic Framer's
 * default spring physics.
 */
function AnimatedText(props: {
    text: string
    className: string
    charClassName: string
    spaceClassName: string
    startDelayMs: number
    perCharDelayMs: number
    animKey: string | number
}) {
    const {
        text,
        className,
        charClassName,
        spaceClassName,
        startDelayMs,
        perCharDelayMs,
        animKey,
    } = props

    const [mounted, setMounted] = React.useState(false)

    // Remount resets to unmounted state so the animation replays
    React.useEffect(() => {
        setMounted(false)
        // Double rAF guarantees the browser has painted the "from" state
        // before we flip to "to", otherwise the transition is skipped.
        let raf1 = 0
        let raf2 = 0
        if (typeof window !== "undefined") {
            raf1 = window.requestAnimationFrame(() => {
                raf2 = window.requestAnimationFrame(() => setMounted(true))
            })
        } else {
            setMounted(true)
        }
        return () => {
            if (typeof window !== "undefined") {
                window.cancelAnimationFrame(raf1)
                window.cancelAnimationFrame(raf2)
            }
        }
    }, [animKey, text])

    const tokens = React.useMemo(() => splitToChars(text), [text])

    // Index characters only (ignore spaces) so the stagger reads as a smooth
    // left-to-right wave instead of pausing on every blank cell.
    let visibleIndex = 0

    return (
        <span className={className} aria-label={text}>
            {tokens.map((token, idx) => {
                if (token.isSpace) {
                    return (
                        <span
                            key={`sp-${idx}`}
                            className={spaceClassName}
                            aria-hidden="true"
                        >
                            {"\u00A0"}
                        </span>
                    )
                }

                const delay = startDelayMs + visibleIndex * perCharDelayMs
                visibleIndex += 1

                return (
                    <span
                        key={`ch-${idx}-${token.char}`}
                        className={`${charClassName}${mounted ? " is-in" : ""}`}
                        style={{ transitionDelay: `${delay}ms` }}
                        aria-hidden="true"
                    >
                        {token.char}
                    </span>
                )
            })}
        </span>
    )
}

/**
 * Full-screen "this boat is no longer available" state.
 *
 * Background image + dark gradient overlay so a white navbar logo and the card
 * text stay legible. CTAs are real anchor links (crawlable, keyboard-friendly).
 * The primary CTA should point at your fleet / listing page (not the bare
 * homepage) so people can keep their search going.
 *
 * Both CTA links come in already resolved by Framer's Link control, so a page
 * link keeps its locale prefix (e.g. /es/...) when the language is switched.
 *
 * NOTE: `unavailableBgImage` is a Framer-hosted (framerusercontent.com) asset,
 * so it is intentionally NOT routed through the /img resize function — Framer
 * already right-sizes its own images, and the function's allowlist would 400 it.
 */
function UnavailableState(props: any) {
    const {
        unavailableEyebrow,
        unavailableTitle,
        unavailableMessage,
        unavailablePrimaryText,
        unavailablePrimaryLink,
        showUnavailableSecondary,
        unavailableSecondaryText,
        unavailableSecondaryLink,
    } = props

    return (
        <div className="boat-detail-component">
            <div
                className="state-screen"
                role="region"
                aria-label="Listing unavailable"
            >
                <div
                    className="state-bg"
                    style={{
                        backgroundImage: props.unavailableBgImage
                            ? `url("${props.unavailableBgImage}")`
                            : "none",
                    }}
                />
                <div className="state-overlay" />
                <div className="state-card">
                    {unavailableEyebrow ? (
                        <p
                            className="state-eyebrow"
                            style={{ ...props.unavailableEyebrowFont }}
                        >
                            {unavailableEyebrow}
                        </p>
                    ) : null}

                    <h1
                        className="state-title"
                        style={{ ...props.unavailableTitleFont }}
                    >
                        {unavailableTitle}
                    </h1>

                    {unavailableMessage ? (
                        <p
                            className="state-message"
                            style={{ ...props.unavailableMessageFont }}
                        >
                            {unavailableMessage}
                        </p>
                    ) : null}

                    <div className="state-actions">
                        <a
                            className="state-btn state-btn-primary"
                            style={{ ...props.unavailablePrimaryFont }}
                            href={unavailablePrimaryLink || "/"}
                        >
                            {unavailablePrimaryText}
                        </a>

                        {showUnavailableSecondary &&
                        unavailableSecondaryText ? (
                            <a
                                className="state-btn state-btn-secondary"
                                style={{ ...props.unavailableSecondaryFont }}
                                href={unavailableSecondaryLink || "/"}
                            >
                                {unavailableSecondaryText}
                            </a>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function BoatDetailPage(props: any) {
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState("")
    const [notFound, setNotFound] = React.useState(false)
    const [boat, setBoat] = React.useState<BoatData | null>(null)
    const [techOpen, setTechOpen] = React.useState(false)
    const [galleryIndex, setGalleryIndex] = React.useState(0)
    const [urlBoatId, setUrlBoatId] = React.useState("")
    // Key used to re-trigger the hero animation every time the boat data refreshes.
    const [heroAnimKey, setHeroAnimKey] = React.useState(0)
    // Only the FIRST gallery slide loads on first paint. Every other slide is
    // deferred until the user does something on the page (scroll / wheel /
    // click / touch / key) — that flips `hasInteracted` and loads the rest.
    // The hero image is a CSS background set inline, so it always loads eagerly.
    const [hasInteracted, setHasInteracted] = React.useState(false)
    // Tracks which gallery slides have been "revealed": the first slide on
    // load, plus any slide the carousel advances to (autoplay / nav). This set
    // only ever grows, so a slide never loses its src / reloads once fetched.
    const [loadedSlides, setLoadedSlides] = React.useState<Set<number>>(
        () => new Set<number>([0])
    )

    // Locale detection — used to localize the Home aria-label the same way the
    // Home Link override does, so the icon's accessible name reads "Inicio" in
    // Spanish and "Home" otherwise.
    const localeInfo = useLocaleInfo()
    const isSpanish = React.useMemo(() => {
        const active = localeInfo?.activeLocale
        if (
            isSpanishLocaleValue(active?.code) ||
            isSpanishLocaleValue(active?.slug) ||
            isSpanishLocaleValue(active?.name)
        ) {
            return true
        }
        if (typeof document !== "undefined") {
            return isSpanishLocaleValue(document.documentElement?.lang)
        }
        return false
    }, [localeInfo])

    const homeAriaLabel = isSpanish
        ? props.homeAriaLabelSpanish || "Inicio"
        : props.homeAriaLabel || "Home"

    useStyleInjectionEffect(() => {
        injectStyle("boat-detail-component-styles", cssText(props))
    }, [props])

    React.useEffect(() => {
        const updateBoatIdFromUrl = () => {
            setUrlBoatId(getBoatIdFromUrl())
        }

        updateBoatIdFromUrl()

        if (typeof window !== "undefined") {
            window.addEventListener("popstate", updateBoatIdFromUrl)
        }

        return () => {
            if (typeof window !== "undefined") {
                window.removeEventListener("popstate", updateBoatIdFromUrl)
            }
        }
    }, [])

    // Flip `hasInteracted` on the first real user action, then stop listening.
    // This is what triggers the remaining gallery images to start downloading.
    React.useEffect(() => {
        if (typeof window === "undefined") return
        if (hasInteracted) return

        const onInteract = () => setHasInteracted(true)

        const events: Array<keyof WindowEventMap> = [
            "scroll",
            "wheel",
            "click",
            "touchstart",
            "keydown",
        ]
        const opts: AddEventListenerOptions = { passive: true, once: true }

        events.forEach((ev) => window.addEventListener(ev, onInteract, opts))

        return () => {
            events.forEach((ev) =>
                window.removeEventListener(ev, onInteract, opts)
            )
        }
    }, [hasInteracted])

    const resolvedBoatId = React.useMemo(() => {
        return urlBoatId || props.boatId || "10022437"
    }, [urlBoatId, props.boatId])

    React.useEffect(() => {
        let cancelled = false

        async function loadBoat() {
            setLoading(true)
            setError("")
            setNotFound(false)

            try {
                const id = encodeURIComponent(resolvedBoatId)
                const url = `${props.apiBaseUrl.replace(/\/$/, "")}/.netlify/functions/boats?id=${id}`
                const res = await fetch(url)

                // "Not found" / "gone" mean the boat is sold or withdrawn —
                // that's the unavailable state, not a technical error.
                if (res.status === 404 || res.status === 410) {
                    if (!cancelled) {
                        setNotFound(true)
                        setBoat(null)
                    }
                    return
                }

                if (!res.ok) {
                    throw new Error(`Failed with status ${res.status}`)
                }

                const json: ApiResponse = await res.json()

                if (!cancelled) {
                    setBoat(json?.data || null)
                    // re-trigger hero animation whenever new boat data arrives
                    setHeroAnimKey((k) => k + 1)
                }
            } catch (err: any) {
                if (!cancelled) {
                    setError(err?.message || "Unable to load boat data.")
                    setBoat(null)
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadBoat()

        return () => {
            cancelled = true
        }
    }, [props.apiBaseUrl, resolvedBoatId])

    // Whether the loaded record is a real, viewable listing. Covers both a
    // 404/410 response and a 200 with a placeholder / empty record.
    const unavailable = React.useMemo(
        () => !loading && !error && (notFound || isBoatUnavailable(boat)),
        [loading, error, notFound, boat]
    )

    React.useEffect(() => {
        if (loading) return
        if (typeof window === "undefined") return
        ;(window as any).__ventura_boat_unavailable = unavailable
        window.dispatchEvent(
            new CustomEvent("ventura:boat-availability", {
                detail: { unavailable },
            })
        )
    }, [loading, unavailable])

    // Optionally noindex sold/unavailable pages so they don't linger in search.
    React.useEffect(() => {
        if (props.noIndexWhenUnavailable) {
            setNoIndex(unavailable)
        } else {
            setNoIndex(false)
        }
        return () => setNoIndex(false)
    }, [unavailable, props.noIndexWhenUnavailable])

    const title = React.useMemo(() => {
        const make = boat?.make || ""
        const model = boat?.model || ""
        return `${make} ${model}`.trim() || props.fallbackTitle
    }, [boat, props.fallbackTitle])

    const heroSubtitle = props.heroSubtitle || "Yacht for sale"

    const descriptionParagraphs = React.useMemo(() => {
        const primary = boat?.description?.trim()
        const priceFallback = (boat as any)?.price_details?.trim()
        const accFallback = (boat as any)?.accommodations?.description?.trim()

        return stripHtmlToParagraphs(primary || priceFallback || accFallback)
    }, [
        boat?.description,
        (boat as any)?.price_details,
        (boat as any)?.accommodations?.description,
    ])

    const detailLines = React.useMemo(() => {
        const details = [
            boat?.year ? String(boat.year) : "",
            boat?.length_metre ? formatLengthMeters(boat.length_metre) : "",
            boat?.max_speed || "",
            boat?.number_of_cabins || "",
            boat?.location
                ? `${props.locationLabelPrefix}${boat.location}`
                : "",
            boat?.boat_id ? `${props.referenceLabel}${boat.boat_id}` : "",
        ]

        return details.filter(Boolean)
    }, [boat, props.locationLabelPrefix, props.referenceLabel])

    const galleryImages = React.useMemo(() => {
        const imgs = [boat?.main_image, ...(boat?.image || [])].filter(
            Boolean
        ) as string[]
        return Array.from(new Set(imgs))
    }, [boat])

    const heroImage = boat?.main_image || galleryImages[0] || ""

    // Build a resized WebP URL via our Netlify /img function.
    // ONLY for external feed photos (boatsgroup / centralyachtagent).
    // Never wrap Framer-hosted images (framerusercontent.com) — the
    // function's allowlist will 400 them and the image will break.
    const sized = React.useCallback(
        (u: string, w = 1280, q = 75) =>
            u
                ? `${props.apiBaseUrl.replace(/\/$/, "")}/img?url=${encodeURIComponent(u)}&w=${w}&q=${q}`
                : "",
        [props.apiBaseUrl]
    )

    const hasGallery = galleryImages.length > 0
    const hasMultipleGallery = galleryImages.length > 1

    const loopedGallery = React.useMemo(() => {
        if (!hasGallery) return []
        if (galleryImages.length === 1) return [galleryImages[0]]

        const first = galleryImages[0]
        const last = galleryImages[galleryImages.length - 1]
        return [last, ...galleryImages, first]
    }, [galleryImages, hasGallery])

    const activeVideo = boat?.videos?.[0]
    const youtubeEmbed = getYoutubeEmbed(activeVideo?.url)
    const showVideo = !!activeVideo?.url

    React.useEffect(() => {
        if (!hasMultipleGallery || props.galleryAutoplayMs <= 0) return
        if (typeof window === "undefined") return

        const timer = window.setInterval(() => {
            setGalleryIndex((prev) => (prev + 1) % galleryImages.length)
        }, props.galleryAutoplayMs)

        return () => window.clearInterval(timer)
    }, [hasMultipleGallery, galleryImages.length, props.galleryAutoplayMs])

    // Reset the carousel (and the "which slides are loaded" memory) whenever a
    // different boat is shown, so slide 1 loads eagerly and slides 2..n wait.
    React.useEffect(() => {
        setGalleryIndex(0)
        setLoadedSlides(new Set<number>([0]))
    }, [resolvedBoatId])

    // Whenever the active slide changes (autoplay or manual nav) remember it,
    // so that slide keeps a real src and never blanks / reloads on return.
    React.useEffect(() => {
        setLoadedSlides((prev) => {
            if (prev.has(galleryIndex)) return prev
            const next = new Set(prev)
            next.add(galleryIndex)
            return next
        })
    }, [galleryIndex])

    const nextSlide = React.useCallback(() => {
        if (!galleryImages.length) return
        setGalleryIndex((prev) => (prev + 1) % galleryImages.length)
    }, [galleryImages.length])

    const prevSlide = React.useCallback(() => {
        if (!galleryImages.length) return
        setGalleryIndex(
            (prev) => (prev - 1 + galleryImages.length) % galleryImages.length
        )
    }, [galleryImages.length])

    const technicalData = React.useMemo(() => {
        const rows: Array<{ key: string; value: string }> = []

        const push = (key: string, value: any) => {
            if (value === null || value === undefined || value === "") return
            rows.push({ key, value: String(value) })
        }

        push("Make", boat?.make)
        push("Model", boat?.model)
        push("Year", boat?.year)
        push(
            "Length (meters)",
            boat?.length_metre ? formatLengthMeters(boat.length_metre) : ""
        )
        push("Cabins", boat?.number_of_cabins || boat?.number_of_cabins_num)
        push("Number of Passengers", boat?.number_of_passengers)
        push("Max Speed", boat?.max_speed)
        push("Tax Status", boat?.tax_status)
        push("Location", boat?.location)
        push(
            "Price",
            boat?.price_title ? decodeHtmlEntity(boat.price_title) : ""
        )
        push("Engine Make", boat?.engine_make)
        push("Engine Model", boat?.engine_model)
        push("Engine Fuel Type", boat?.engine_fuel_type)
        push(
            "Engine Power",
            boat?.engine_power
                ? `${boat.engine_power}${boat.engine_power_unit ? ` ${boat.engine_power_unit}` : ""}`
                : ""
        )

        return rows
    }, [boat])

    const galleryTrackStyle: React.CSSProperties = {
        ["--gallery-index" as any]: galleryIndex + 1,
        ["--gallery-mobile-index" as any]: galleryIndex,
    }

    const isDesktop =
        typeof window !== "undefined" ? window.innerWidth > 767 : true

    // Subtitle begins after the title has mostly landed — same rhythm you'd get
    // in Framer by applying the Text Effect to both nodes with an offset delay.
    const subtitleStartDelayMs =
        props.heroAnimDelay +
        Math.max(0, title.replace(/\s/g, "").length) * props.heroAnimPerChar +
        props.heroSubtitleStagger

    if (loading) {
        return (
            <div className="boat-detail-component">
                <div className="loading-wrap">
                    <div>
                        <div className="spinner" />
                        <div className="loading-text">{props.loadingText}</div>
                    </div>
                </div>
            </div>
        )
    }

    // A genuine technical/network failure (500, timeout, bad JSON). Distinct
    // from "boat sold" — this is transient, so we keep it plain.
    if (error) {
        return (
            <div className="boat-detail-component">
                <div className="error-wrap">
                    <div className="error-text">{error}</div>
                </div>
            </div>
        )
    }

    // Boat is sold / withdrawn / never existed → clean, on-brand detour card.
    if (unavailable) {
        return <UnavailableState {...props} />
    }

    return (
        <div className="boat-detail-component">
            <div className="section-container hero-container">
                <div className="section-wrapper hero-wrapper">
                    <section className="hero" aria-label="Boat hero section">
                        <div
                            className="hero-bg"
                            style={{
                                backgroundImage: heroImage
                                    ? `url("${sized(heroImage, 1600)}")`
                                    : "none",
                            }}
                        />
                        <div className="hero-overlay" />
                        <div className="hero-content">
                            <h1 className="hero-title">
                                <AnimatedText
                                    text={title}
                                    className="hero-title-inner"
                                    charClassName="hero-title-char"
                                    spaceClassName="hero-title-space"
                                    startDelayMs={props.heroAnimDelay}
                                    perCharDelayMs={props.heroAnimPerChar}
                                    animKey={`${heroAnimKey}-${resolvedBoatId}`}
                                />
                            </h1>
                            {heroSubtitle ? (
                                <p className="hero-subtitle">
                                    <AnimatedText
                                        text={heroSubtitle}
                                        className="hero-subtitle-inner"
                                        charClassName="hero-subtitle-char"
                                        spaceClassName="hero-subtitle-space"
                                        startDelayMs={subtitleStartDelayMs}
                                        perCharDelayMs={props.heroAnimPerChar}
                                        animKey={`${heroAnimKey}-${resolvedBoatId}-sub`}
                                    />
                                </p>
                            ) : null}
                        </div>
                    </section>
                </div>
            </div>

            <div className="section-container breadcrumbs-container">
                <div className="section-wrapper breadcrumbs-wrapper">
                    <nav className="breadcrumbs" aria-label="Breadcrumb">
                        <a
                            href={props.breadcrumbHomeLink || "/"}
                            aria-label={homeAriaLabel}
                            className="breadcrumb-link"
                        >
                            <span className="breadcrumb-item">
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 16 18"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        d="M1.5 16.125H5.25V10.625C5.25 10.4125 5.3219 10.2344 5.46575 10.0905C5.6094 9.94685 5.7875 9.875 6 9.875H10C10.2125 9.875 10.3906 9.94685 10.5345 10.0905C10.6782 10.2344 10.75 10.4125 10.75 10.625V16.125H14.5V6.375L8 1.5L1.5 6.375V16.125ZM0 16.125V6.375C0 6.1375 0.0531651 5.9125 0.1595 5.7C0.265665 5.4875 0.4125 5.3125 0.6 5.175L7.1 0.3C7.36135 0.0999999 7.66 0 7.996 0C8.332 0 8.63335 0.0999999 8.9 0.3L15.4 5.175C15.5875 5.3125 15.7344 5.4875 15.8407 5.7C15.9469 5.9125 16 6.1375 16 6.375V16.125C16 16.5375 15.8531 16.8906 15.5595 17.1842C15.2656 17.4781 14.9125 17.625 14.5 17.625H10C9.7875 17.625 9.6094 17.5531 9.46575 17.4093C9.3219 17.2656 9.25 17.0875 9.25 16.875V11.375H6.75V16.875C6.75 17.0875 6.67815 17.2656 6.5345 17.4093C6.39065 17.5531 6.2125 17.625 6 17.625H1.5C1.0875 17.625 0.734415 17.4781 0.44075 17.1842C0.146915 16.8906 0 16.5375 0 16.125Z"
                                        fill="#343434"
                                    />
                                </svg>
                            </span>
                        </a>

                        <span className="breadcrumb-sep">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#343434"
                                strokeWidth="1"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="lucide lucide-chevron-right-icon lucide-chevron-right"
                            >
                                <path d="m9 18 6-6-6-6" />
                            </svg>
                        </span>

                        {props.breadcrumbParentLink ? (
                            <a
                                href={props.breadcrumbParentLink}
                                className="breadcrumb-link"
                            >
                                <span className="breadcrumb-item">
                                    {props.breadcrumbParent}
                                </span>
                            </a>
                        ) : (
                            <span className="breadcrumb-item">
                                {props.breadcrumbParent}
                            </span>
                        )}

                        <span className="breadcrumb-sep">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#343434"
                                strokeWidth="1"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="lucide lucide-chevron-right-icon lucide-chevron-right"
                            >
                                <path d="m9 18 6-6-6-6" />
                            </svg>
                        </span>

                        <span className="breadcrumb-current">{title}</span>
                    </nav>
                </div>
            </div>

            <div className="section-container intro-container">
                <div className="section-wrapper intro-wrapper">
                    <div className="intro-grid">
                        <div className="intro-left">
                            <h2 className="intro-heading">{title}</h2>

                            <div className="details-list">
                                {detailLines.map((line, index) => (
                                    <p
                                        className="detail-line"
                                        key={`${line}-${index}`}
                                    >
                                        {line}
                                    </p>
                                ))}
                            </div>

                            {props.showBackButton ? (
                                <div className="intro-button-row">
                                    <button
                                        className="back-button"
                                        type="button"
                                        onClick={() => {
                                            if (typeof window === "undefined") {
                                                return
                                            }

                                            if (props.backButtonLink) {
                                                window.location.href =
                                                    props.backButtonLink
                                            } else {
                                                window.history.back()
                                            }
                                        }}
                                    >
                                        {props.backButtonText}
                                    </button>
                                </div>
                            ) : null}
                        </div>

                        <div className="intro-right">
                            <div className="description">
                                {descriptionParagraphs.length ? (
                                    descriptionParagraphs.map(
                                        (paragraph, index) => (
                                            <p key={index}>{paragraph}</p>
                                        )
                                    )
                                ) : (
                                    <p>{props.noDescriptionText}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showVideo ? (
                <div className="section-container video-container">
                    <div className="section-wrapper video-wrapper">
                        <div className="video-frame">
                            {isMp4(activeVideo?.url) ? (
                                <video
                                    controls
                                    playsInline
                                    preload="auto"
                                    poster={activeVideo?.thumbnail || undefined}
                                >
                                    <source
                                        src={activeVideo?.url}
                                        type="video/mp4"
                                    />
                                </video>
                            ) : youtubeEmbed ? (
                                <iframe
                                    src={youtubeEmbed}
                                    title={activeVideo?.title || "Boat video"}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowFullScreen
                                />
                            ) : (
                                <iframe
                                    src={activeVideo?.url}
                                    title={activeVideo?.title || "Boat video"}
                                    allow="autoplay; fullscreen; picture-in-picture"
                                    allowFullScreen
                                />
                            )}
                        </div>

                        {props.showVideoCaption && activeVideo?.title ? (
                            <div className="video-caption">
                                {activeVideo.title}
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {hasGallery ? (
                <div className="section-container gallery-container">
                    <div className="section-wrapper gallery-wrapper">
                        <div className="gallery-header">
                            <h2 className="section-title">
                                {props.galleryTitle}
                            </h2>

                            {hasMultipleGallery ? (
                                <div className="gallery-nav">
                                    <button
                                        className="gallery-nav-btn"
                                        type="button"
                                        aria-label="Previous gallery image"
                                        onClick={prevSlide}
                                    >
                                        <svg
                                            width="22"
                                            height="22"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="rgb(176, 138, 42)"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                        >
                                            <path d="M20 12H4M10 18l-6-6 6-6"></path>
                                        </svg>
                                    </button>
                                    <button
                                        className="gallery-nav-btn"
                                        type="button"
                                        aria-label="Next gallery image"
                                        onClick={nextSlide}
                                    >
                                        <svg
                                            width="22"
                                            height="22"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="rgb(176, 138, 42)"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                        >
                                            <path d="M4 12h16M14 6l6 6-6 6"></path>
                                        </svg>
                                    </button>
                                </div>
                            ) : null}
                        </div>

                        <div className="gallery-viewport">
                            <div
                                className="gallery-track"
                                style={galleryTrackStyle}
                            >
                                {isDesktop
                                    ? loopedGallery.map((src, index) => {
                                          const isActive =
                                              index === galleryIndex + 1

                                          // Map this looped position back to a
                                          // real image index. loopedGallery is
                                          // [last, ...images, first]; the two
                                          // clones at the ends point at the
                                          // real last / first images.
                                          const logicalIndex =
                                              index === 0
                                                  ? galleryImages.length - 1
                                                  : index ===
                                                      loopedGallery.length - 1
                                                    ? 0
                                                    : index - 1

                                          // First slide loads on first paint;
                                          // everything else waits for the user
                                          // to interact (or for autoplay/nav to
                                          // reveal that slide).
                                          const shouldLoad =
                                              hasInteracted ||
                                              loadedSlides.has(logicalIndex)

                                          return (
                                              <div
                                                  className="gallery-slide"
                                                  key={`${src}-${index}`}
                                              >
                                                  <div
                                                      className={`gallery-card ${isActive ? "is-active" : "is-side"}`}
                                                  >
                                                      <img
                                                          src={
                                                              shouldLoad
                                                                  ? sized(
                                                                        src,
                                                                        1280
                                                                    )
                                                                  : undefined
                                                          }
                                                          srcSet={
                                                              shouldLoad
                                                                  ? `${sized(src, 640)} 640w, ${sized(src, 960)} 960w, ${sized(src, 1280)} 1280w, ${sized(src, 1600)} 1600w`
                                                                  : undefined
                                                          }
                                                          sizes="(max-width:767px) 100vw, 84vw"
                                                          //data-src={src}
                                                          loading="lazy"
                                                          decoding="async"
                                                          alt={`${title} gallery ${index + 1}`}
                                                      />
                                                  </div>
                                              </div>
                                          )
                                      })
                                    : galleryImages.map((src, index) => {
                                          // Mobile uses the raw image list, so
                                          // the slide index is the image index.
                                          const shouldLoad =
                                              hasInteracted ||
                                              loadedSlides.has(index)

                                          return (
                                              <div
                                                  className="gallery-slide"
                                                  key={`${src}-${index}`}
                                              >
                                                  <div className="gallery-card is-active">
                                                      <img
                                                          src={
                                                              shouldLoad
                                                                  ? sized(
                                                                        src,
                                                                        1280
                                                                    )
                                                                  : undefined
                                                          }
                                                          srcSet={
                                                              shouldLoad
                                                                  ? `${sized(src, 640)} 640w, ${sized(src, 960)} 960w, ${sized(src, 1280)} 1280w, ${sized(src, 1600)} 1600w`
                                                                  : undefined
                                                          }
                                                          sizes="(max-width:767px) 100vw, 84vw"
                                                          //data-src={src}
                                                          loading="lazy"
                                                          decoding="async"
                                                          alt={`${title} gallery ${index + 1}`}
                                                      />
                                                  </div>
                                              </div>
                                          )
                                      })}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="section-container tech-container">
                <div className="section-wrapper tech-wrapper">
                    <button
                        className={`tech-toggle ${techOpen ? "is-open" : ""}`}
                        type="button"
                        aria-expanded={techOpen}
                        onClick={() => setTechOpen((prev) => !prev)}
                    >
                        <h2 className="tech-toggle-title">{props.techTitle}</h2>
                        <span className="tech-toggle-label">
                            {techOpen
                                ? props.techCloseLabel
                                : props.techOpenLabel}
                            {chevronIcon(techOpen)}
                        </span>
                    </button>

                    <div className={`tech-panel ${techOpen ? "open" : ""}`}>
                        <div className="tech-grid">
                            {technicalData.length ? (
                                technicalData.map((item) => (
                                    <div className="tech-item" key={item.key}>
                                        <p className="tech-key">
                                            <strong>{item.key}</strong>
                                        </p>
                                        <p className="tech-value">
                                            {item.value}
                                        </p>
                                    </div>
                                ))
                            ) : (
                                <div className="tech-item">
                                    <p className="tech-value">
                                        {props.noTechnicalDataText}
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className="tech-footer-line" />
                    </div>
                </div>
            </div>
        </div>
    )
}

BoatDetailPage.defaultProps = {
    apiBaseUrl: "https://venturayachts.netlify.app",
    boatId: "10022437",

    fallbackTitle: "Boat Detail",
    heroSubtitle: "Yacht for sale",

    breadcrumbHome: "Home",
    breadcrumbHomeLink: "/",
    homeAriaLabel: "Home",
    homeAriaLabelSpanish: "Inicio",
    breadcrumbParent: "Brokerage",
    breadcrumbParentLink: "",

    backButtonText: "Back to Results",
    backButtonLink: "",
    showBackButton: true,

    galleryTitle: "Gallery",
    techTitle: "Technical Data",
    techOpenLabel: "Tap to Open",
    techCloseLabel: "Tap to Close",
    techOpenLabelColor: "#343434",
    techCloseLabelColor: "#343434",

    locationLabelPrefix: "Lying ",
    referenceLabel: "Reference: ",

    loadingText: "Loading boat details...",
    emptyText: "No boat data found.",
    noDescriptionText: "Description is not available.",
    noTechnicalDataText: "Technical data is not available.",
    showVideoCaption: false,

    // ===== Sold / unavailable state =====
    unavailableEyebrow: "No Longer Listed",
    unavailableEyebrowColor: "#FFFFFF",
    unavailableTitle: "This Yacht Is No Longer Available",
    unavailableMessage:
        "This yacht has been sold or withdrawn from our current listings. Explore the rest of our fleet — we may have a similar vessel that's a perfect match.",
    unavailablePrimaryText: "Explore Our Fleet",
    unavailablePrimaryLink: "/",
    showUnavailableSecondary: true,
    unavailableSecondaryText: "Contact Us",
    unavailableSecondaryLink: "/contact",
    unavailablePrimaryTextColor: "#FFFFFF",
    unavailablePrimaryBg: "#8c6e28",
    unavailableMinHeight: 620,
    unavailableBg: "#2A2F36",
    unavailableBgImage:
        "https://framerusercontent.com/images/uSahKd136eNW7Y3Q14IhjgCpzc.jpg",
    unavailableTextColor: "#FFFFFF",
    unavailableOverlayTop: 0.45,
    unavailableOverlayBottom: 0.55,
    noIndexWhenUnavailable: true,

    // ----- Sold / unavailable state: typography (Font objects) -----
    // Size, line-height and letter-spacing live inside these font objects, so
    // the Font control in Framer is the single source of truth for type.
    unavailableEyebrowFont: {
        fontFamily: "Bell Gothic Std Light",
        fontWeight: "300",
        fontSize: 13,
        letterSpacing: "0.2em",
    },
    unavailableTitleFont: {
        fontFamily: "BlairMdITC TT Medium",
        fontWeight: "500",
        fontSize: 34,
        lineHeight: 1.05,
        letterSpacing: "-0.03em",
    },
    unavailableMessageFont: {
        fontFamily: "Bell Gothic Std Light",
        fontWeight: "300",
        fontSize: 17,
        lineHeight: 1.55,
    },
    unavailablePrimaryFont: {
        fontFamily: "Bell Gothic Std Light",
        fontWeight: "300",
        fontSize: 14,
        letterSpacing: "0.08em",
    },
    unavailableSecondaryFont: {
        fontFamily: "Bell Gothic Std Light",
        fontWeight: "300",
        fontSize: 14,
        letterSpacing: "0.08em",
    },

    // ----- Sold / unavailable state: button styling -----
    unavailablePrimaryBorderColor: "#8c6e28",
    unavailablePrimaryBorderWidth: 1,
    unavailablePrimaryRadius: 999,
    unavailableSecondaryBg: "transparent",
    unavailableSecondaryTextColor: "#FFFFFF",
    unavailableSecondaryBorderColor: "#FFFFFF",
    unavailableSecondaryBorderWidth: 1,
    unavailableSecondaryRadius: 999,

    // ----- Sold / unavailable state: spacing -----
    unavailableEyebrowGap: 40,
    unavailableContentGap: 32,
    unavailableButtonGap: 14,

    wrapperMaxWidth: 1280,
    breadcrumbMaxWidth: 1000,
    videoMaxWidth: 1240,
    techMaxWidth: 980,
    sidePadding: 32,

    heroHeight: 500,
    heroTitleSize: 94,
    heroSubtitleSize: 16,
    heroTitleLetterSpacing: -0.05,

    // Per-character text-effect controls (Framer Text Effect equivalent)
    heroAnimDelay: 600, // matches Framer Delay: 0.6s (before first character starts)
    heroAnimPerChar: 45, // stagger between characters (ms)
    heroSubtitleStagger: 120, // extra gap after title finishes before subtitle starts

    sectionTitleSize: 38,
    introHeadingSize: 34,
    techKeySize: 18,
    bodySize: 17,
    bodyLineHeight: 1.45,
    bodyLetterSpacing: 0.0,
    headingLetterSpacing: -0.04,
    breadcrumbSize: 14,
    buttonSize: 14,
    buttonLetterSpacing: 0.08,

    introTop: 80,
    introBottom: 70,
    introGap: 70,

    videoTop: 40,
    videoBottom: 70,
    galleryTop: 20,
    galleryBottom: 70,
    techTop: 40,
    techBottom: 80,

    galleryAutoplayMs: 4000,
    gallerySlideWidthPercent: 84,
    gallerySlideGap: 12,
    sideSlideOpacity: 0.55,
    galleryAspectX: 16,
    galleryAspectY: 7,
    videoAspectX: 16,
    videoAspectY: 9,

    accentColor: "#8d6814",
    textColor: "#343434",
    borderColor: "rgba(0,0,0,0.08)",
    introBg: "#F5F3EE",
    breadcrumbBg: "#ECE9E6",
    galleryBg: "#F3F1EC",
    videoSectionBg: "#EAE5DB",
    techBg: "#F3F1EC",
    heroFallbackBg: "#B9C3CC",
    heroTextColor: "#FFFFFF",
    breadcrumbTextColor: "#555555",
    buttonBg: "transparent",
    buttonTextColor: "#4A4A4A",
    buttonBorderColor: "rgba(0,0,0,0.35)",
    heroOverlayTop: 0.28,
    heroOverlayBottom: 0.28,

    headingFont: {
        fontFamily: "Sohne",
        fontWeight: "500",
    },
    bodyFont: {
        fontFamily: "Bell Gothic Std Light",
        fontWeight: "300",
    },
}

addPropertyControls(BoatDetailPage, {
    apiBaseUrl: {
        type: ControlType.String,
        title: "API Base",
    },
    boatId: {
        type: ControlType.String,
        title: "Boat ID",
    },

    fallbackTitle: {
        type: ControlType.String,
        title: "Fallback",
    },
    heroSubtitle: {
        type: ControlType.String,
        title: "Hero Sub",
    },

    breadcrumbHome: {
        type: ControlType.String,
        title: "Crumb 1",
    },
    breadcrumbHomeLink: {
        type: ControlType.Link,
        title: "Crumb 1 Link",
    },
    homeAriaLabel: {
        type: ControlType.String,
        title: "Home Aria",
    },
    homeAriaLabelSpanish: {
        type: ControlType.String,
        title: "Home Aria ES",
    },
    breadcrumbParent: {
        type: ControlType.String,
        title: "Crumb 2",
    },
    breadcrumbParentLink: {
        type: ControlType.Link,
        title: "Crumb 2 Link",
    },

    showBackButton: {
        type: ControlType.Boolean,
        title: "Back Btn",
        defaultValue: true,
    },
    backButtonText: {
        type: ControlType.String,
        title: "Back Text",
        hidden: (props) => !props.showBackButton,
    },
    backButtonLink: {
        type: ControlType.Link,
        title: "Back Link",
        hidden: (props) => !props.showBackButton,
    },

    galleryTitle: {
        type: ControlType.String,
        title: "Gallery",
    },
    techTitle: {
        type: ControlType.String,
        title: "Tech Title",
    },
    techOpenLabel: {
        type: ControlType.String,
        title: "Open Label",
    },
    techCloseLabel: {
        type: ControlType.String,
        title: "Close Label",
    },
    techOpenLabelColor: {
        type: ControlType.Color,
        title: "Open Color",
    },
    techCloseLabelColor: {
        type: ControlType.Color,
        title: "Close Color",
    },
    showVideoCaption: {
        type: ControlType.Boolean,
        title: "Video Caption",
        defaultValue: false,
    },

    // ===== Sold / unavailable state =====
    unavailableEyebrow: {
        type: ControlType.String,
        title: "Sold Eyebrow",
    },
    unavailableEyebrowColor: {
        type: ControlType.Color,
        title: "Eyebrow Col",
    },
    unavailableEyebrowFont: {
        type: ControlType.Font,
        title: "Eyebrow Font",
        controls: "extended",
    },
    unavailableTitle: {
        type: ControlType.String,
        title: "Sold Title",
    },
    unavailableTitleFont: {
        type: ControlType.Font,
        title: "Title Font",
        controls: "extended",
    },
    unavailableMessage: {
        type: ControlType.String,
        title: "Sold Message",
        displayTextArea: true,
    },
    unavailableMessageFont: {
        type: ControlType.Font,
        title: "Message Font",
        controls: "extended",
    },
    // ----- Primary CTA -----
    unavailablePrimaryText: {
        type: ControlType.String,
        title: "CTA Text",
    },
    unavailablePrimaryLink: {
        type: ControlType.Link,
        title: "CTA Link",
    },
    unavailablePrimaryFont: {
        type: ControlType.Font,
        title: "CTA Font",
        controls: "extended",
    },
    unavailablePrimaryTextColor: {
        type: ControlType.Color,
        title: "CTA Text Col",
    },
    unavailablePrimaryBg: {
        type: ControlType.Color,
        title: "CTA BG",
    },
    unavailablePrimaryBorderColor: {
        type: ControlType.Color,
        title: "CTA Border",
    },
    unavailablePrimaryBorderWidth: {
        type: ControlType.Number,
        title: "CTA Bd W",
        min: 0,
        max: 8,
        step: 1,
    },
    unavailablePrimaryRadius: {
        type: ControlType.Number,
        title: "CTA Radius",
        min: 0,
        max: 999,
        step: 1,
    },

    // ----- Secondary CTA -----
    showUnavailableSecondary: {
        type: ControlType.Boolean,
        title: "2nd CTA",
        defaultValue: true,
    },
    unavailableSecondaryText: {
        type: ControlType.String,
        title: "2nd Text",
        hidden: (props) => !props.showUnavailableSecondary,
    },
    unavailableSecondaryLink: {
        type: ControlType.Link,
        title: "2nd Link",
        hidden: (props) => !props.showUnavailableSecondary,
    },
    unavailableSecondaryFont: {
        type: ControlType.Font,
        title: "2nd Font",
        controls: "extended",
        hidden: (props) => !props.showUnavailableSecondary,
    },
    unavailableSecondaryTextColor: {
        type: ControlType.Color,
        title: "2nd Text Col",
        hidden: (props) => !props.showUnavailableSecondary,
    },
    unavailableSecondaryBg: {
        type: ControlType.Color,
        title: "2nd BG",
        hidden: (props) => !props.showUnavailableSecondary,
    },
    unavailableSecondaryBorderColor: {
        type: ControlType.Color,
        title: "2nd Border",
        hidden: (props) => !props.showUnavailableSecondary,
    },
    unavailableSecondaryBorderWidth: {
        type: ControlType.Number,
        title: "2nd Bd W",
        min: 0,
        max: 8,
        step: 1,
        hidden: (props) => !props.showUnavailableSecondary,
    },
    unavailableSecondaryRadius: {
        type: ControlType.Number,
        title: "2nd Radius",
        min: 0,
        max: 999,
        step: 1,
        hidden: (props) => !props.showUnavailableSecondary,
    },

    // ----- Sold state spacing -----
    unavailableEyebrowGap: {
        type: ControlType.Number,
        title: "Eyebrow Gap",
        min: 0,
        max: 120,
        step: 1,
    },
    unavailableContentGap: {
        type: ControlType.Number,
        title: "Content Gap",
        min: 0,
        max: 120,
        step: 1,
    },
    unavailableButtonGap: {
        type: ControlType.Number,
        title: "Button Gap",
        min: 0,
        max: 80,
        step: 1,
    },

    unavailableMinHeight: {
        type: ControlType.Number,
        title: "Sold Height",
        min: 320,
        max: 1000,
        step: 10,
    },
    unavailableBg: {
        type: ControlType.Color,
        title: "Sold BG",
    },
    unavailableBgImage: {
        type: ControlType.Image,
        title: "Sold Image",
    },
    unavailableTextColor: {
        type: ControlType.Color,
        title: "Sold Text",
    },
    unavailableOverlayTop: {
        type: ControlType.Number,
        title: "Overlay Top",
        min: 0,
        max: 1,
        step: 0.05,
    },
    unavailableOverlayBottom: {
        type: ControlType.Number,
        title: "Overlay Bot",
        min: 0,
        max: 1,
        step: 0.05,
    },
    noIndexWhenUnavailable: {
        type: ControlType.Boolean,
        title: "Noindex Sold",
        defaultValue: true,
    },

    wrapperMaxWidth: {
        type: ControlType.Number,
        title: "Wrap Max",
        min: 800,
        max: 1800,
        step: 10,
    },
    breadcrumbMaxWidth: {
        type: ControlType.Number,
        title: "Crumb Max",
        min: 600,
        max: 1400,
        step: 10,
    },
    videoMaxWidth: {
        type: ControlType.Number,
        title: "Video Max",
        min: 600,
        max: 1800,
        step: 10,
    },
    techMaxWidth: {
        type: ControlType.Number,
        title: "Tech Max",
        min: 600,
        max: 1800,
        step: 10,
    },
    sidePadding: {
        type: ControlType.Number,
        title: "Padding",
        min: 0,
        max: 80,
        step: 2,
    },

    heroHeight: {
        type: ControlType.Number,
        title: "Hero H",
        min: 300,
        max: 900,
        step: 10,
    },
    heroTitleSize: {
        type: ControlType.Number,
        title: "Hero Size",
        min: 30,
        max: 140,
        step: 1,
    },
    heroSubtitleSize: {
        type: ControlType.Number,
        title: "Sub Size",
        min: 10,
        max: 32,
        step: 1,
    },

    // Text-effect controls
    heroAnimDelay: {
        type: ControlType.Number,
        title: "Anim Delay",
        min: 0,
        max: 3000,
        step: 50,
    },
    heroAnimPerChar: {
        type: ControlType.Number,
        title: "Per Char",
        min: 10,
        max: 200,
        step: 5,
    },
    heroSubtitleStagger: {
        type: ControlType.Number,
        title: "Sub Delay",
        min: 0,
        max: 2000,
        step: 25,
    },

    sectionTitleSize: {
        type: ControlType.Number,
        title: "Sec Title",
        min: 18,
        max: 72,
        step: 1,
    },
    introHeadingSize: {
        type: ControlType.Number,
        title: "Intro Title",
        min: 18,
        max: 72,
        step: 1,
    },
    techKeySize: {
        type: ControlType.Number,
        title: "Tech Key",
        min: 12,
        max: 36,
        step: 1,
    },
    bodySize: {
        type: ControlType.Number,
        title: "Body Size",
        min: 12,
        max: 28,
        step: 1,
    },
    breadcrumbSize: {
        type: ControlType.Number,
        title: "Crumb Size",
        min: 10,
        max: 22,
        step: 1,
    },
    buttonSize: {
        type: ControlType.Number,
        title: "Btn Size",
        min: 10,
        max: 22,
        step: 1,
    },

    introTop: {
        type: ControlType.Number,
        title: "Intro Top",
        min: 0,
        max: 160,
        step: 2,
    },
    introBottom: {
        type: ControlType.Number,
        title: "Intro Bot",
        min: 0,
        max: 160,
        step: 2,
    },
    introGap: {
        type: ControlType.Number,
        title: "Intro Gap",
        min: 10,
        max: 140,
        step: 2,
    },
    videoTop: {
        type: ControlType.Number,
        title: "Video Top",
        min: 0,
        max: 160,
        step: 2,
    },
    videoBottom: {
        type: ControlType.Number,
        title: "Video Bot",
        min: 0,
        max: 160,
        step: 2,
    },
    galleryTop: {
        type: ControlType.Number,
        title: "Gal Top",
        min: 0,
        max: 160,
        step: 2,
    },
    galleryBottom: {
        type: ControlType.Number,
        title: "Gal Bot",
        min: 0,
        max: 160,
        step: 2,
    },
    techTop: {
        type: ControlType.Number,
        title: "Tech Top",
        min: 0,
        max: 160,
        step: 2,
    },
    techBottom: {
        type: ControlType.Number,
        title: "Tech Bot",
        min: 0,
        max: 160,
        step: 2,
    },

    galleryAutoplayMs: {
        type: ControlType.Number,
        title: "Autoplay",
        min: 0,
        max: 10000,
        step: 500,
    },
    gallerySlideWidthPercent: {
        type: ControlType.Number,
        title: "Slide %",
        min: 60,
        max: 100,
        step: 1,
    },
    gallerySlideGap: {
        type: ControlType.Number,
        title: "Slide Gap",
        min: 0,
        max: 40,
        step: 1,
    },

    headingFont: {
        type: ControlType.Font,
        title: "Heading Font",
        controls: "extended",
    },
    bodyFont: {
        type: ControlType.Font,
        title: "Body Font",
        controls: "extended",
    },

    accentColor: {
        type: ControlType.Color,
        title: "Accent",
    },
    textColor: {
        type: ControlType.Color,
        title: "Text",
    },
    borderColor: {
        type: ControlType.Color,
        title: "Border",
    },
    introBg: {
        type: ControlType.Color,
        title: "Intro BG",
    },
    breadcrumbBg: {
        type: ControlType.Color,
        title: "Crumb BG",
    },
    galleryBg: {
        type: ControlType.Color,
        title: "Gal BG",
    },
    videoSectionBg: {
        type: ControlType.Color,
        title: "Video BG",
    },
    techBg: {
        type: ControlType.Color,
        title: "Tech BG",
    },
    heroFallbackBg: {
        type: ControlType.Color,
        title: "Hero BG",
    },
    heroTextColor: {
        type: ControlType.Color,
        title: "Hero Text",
    },
    breadcrumbTextColor: {
        type: ControlType.Color,
        title: "Crumb Text",
    },
    buttonBg: {
        type: ControlType.Color,
        title: "Btn BG",
    },
    buttonTextColor: {
        type: ControlType.Color,
        title: "Btn Text",
    },
    buttonBorderColor: {
        type: ControlType.Color,
        title: "Btn Border",
    },
})
