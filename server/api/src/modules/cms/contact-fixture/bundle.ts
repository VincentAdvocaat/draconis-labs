// Sanitized, self-contained contact structure. No original content or runtime dataset.
export interface ContactBundle {id:'sanitized-contact';schemaVersion:1;sourceDefaultLocale:'en';provenance:Record<string,string|boolean>;bindings:Array<{id:string;key:string;target:string;sourceLine:number}>;html:string;css:string;js:string}
export const contactBundle:ContactBundle={
  "id": "sanitized-contact",
  "schemaVersion": 1,
  "sourceDefaultLocale": "en",
  "provenance": {
    "source": "Demo/vincent-advocaat/10-publish/site/contact.html",
    "sourceSha256": "25f1b126fb85c4c5acabed6dc9a140db05c2675ffed36436a9f7067df98a0545",
    "sourceCssSha256": "ccd4b1daf67b183a55caed3999ea410c0c94246e3cac951c6dc5d9117212b164",
    "sourceNavSha256": "379d0f45f806b661ba11a1fbf58bf5b4be7153bc55f885bdc21d20f0348a1ca8",
    "sanitized": true,
    "sourceDefaultLocale": "en"
  },
  "bindings": [
    {
      "id": "b01",
      "key": "_shared.skipLink",
      "target": "text",
      "sourceLine": 14
    },
    {
      "id": "b02",
      "key": "_shared.brandName",
      "target": "text",
      "sourceLine": 17
    },
    {
      "id": "b03",
      "key": "_shared.navHome",
      "target": "text",
      "sourceLine": 21
    },
    {
      "id": "b04",
      "key": "_shared.navWork",
      "target": "text",
      "sourceLine": 22
    },
    {
      "id": "b05",
      "key": "_shared.navTravels",
      "target": "text",
      "sourceLine": 23
    },
    {
      "id": "b06",
      "key": "_shared.navAbout",
      "target": "text",
      "sourceLine": 24
    },
    {
      "id": "b07",
      "key": "_shared.navOffice",
      "target": "text",
      "sourceLine": 25
    },
    {
      "id": "b08",
      "key": "_shared.navContact",
      "target": "text",
      "sourceLine": 25
    },
    {
      "id": "b09",
      "key": "_shared.navMenu",
      "target": "text",
      "sourceLine": 33
    },
    {
      "id": "b10",
      "key": "contact.heading",
      "target": "text",
      "sourceLine": 41
    },
    {
      "id": "b11",
      "key": "contact.intro",
      "target": "text",
      "sourceLine": 42
    },
    {
      "id": "b12",
      "key": "contact.note",
      "target": "text",
      "sourceLine": 43
    },
    {
      "id": "b13",
      "key": "contact.email",
      "target": "text + derived safe mailto href",
      "sourceLine": 45
    },
    {
      "id": "b14",
      "key": "contact.githubUrl",
      "target": "href",
      "sourceLine": 46
    },
    {
      "id": "b15",
      "key": "contact.linkedinUrl",
      "target": "href",
      "sourceLine": 47
    },
    {
      "id": "b16",
      "key": "_shared.footerNow",
      "target": "text",
      "sourceLine": 56
    },
    {
      "id": "b17",
      "key": "_shared.navAbout",
      "target": "text",
      "sourceLine": 57
    },
    {
      "id": "b18",
      "key": "contact.metaTitle",
      "target": "title",
      "sourceLine": 4
    },
    {
      "id": "b19",
      "key": "navigation.locale.en",
      "target": "text",
      "sourceLine": 29
    },
    {
      "id": "b20",
      "key": "navigation.locale.nl",
      "target": "text",
      "sourceLine": 31
    },
    {
      "id": "b21",
      "key": "contact.eyebrow",
      "target": "text",
      "sourceLine": 40
    },
    {
      "id": "b22",
      "key": "contact.githubLabel",
      "target": "text",
      "sourceLine": 46
    },
    {
      "id": "b23",
      "key": "contact.linkedinLabel",
      "target": "text",
      "sourceLine": 47
    },
    {
      "id": "b24",
      "key": "_shared.brandName",
      "target": "text",
      "sourceLine": 54
    },
    {
      "id": "b25",
      "key": "_shared.footerCopyright",
      "target": "text",
      "sourceLine": 59
    },
    {
      "id": "b26",
      "key": "_shared.primaryNavigationLabel",
      "target": "aria-label",
      "sourceLine": 19
    },
    {
      "id": "b27",
      "key": "navigation.languageLabel",
      "target": "aria-label",
      "sourceLine": 28
    }
  ],
  "html": "<!doctype html><html lang=\"{{locale}}\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{{b18}}</title>{{style}}</head><body>\n<a class=\"skip-link\" href=\"#main\">{{b01}}</a><header class=\"site-header\"><div class=\"site-header__inner\"><a class=\"brand\" href=\"{{route.home}}\">{{b02}}</a>\n<nav id=\"site-nav\" aria-label=\"{{b26}}\"><a href=\"{{route.home}}\">{{b03}}</a><a href=\"{{route.work}}\">{{b04}}</a><a href=\"{{route.travels}}\">{{b05}}</a><a href=\"{{route.about}}\">{{b06}}</a><a href=\"{{route.office}}\">{{b07}}</a><a href=\"{{route.contact}}\">{{b08}}</a></nav>\n<div class=\"lang-switch\" aria-label=\"{{b27}}\"><a lang=\"en\" hreflang=\"en\" href=\"{{language.en}}\">{{b19}}</a><a lang=\"nl\" hreflang=\"nl\" href=\"{{language.nl}}\">{{b20}}</a></div><button class=\"nav-toggle\" aria-controls=\"site-nav\" aria-expanded=\"false\">{{b09}}</button></div></header>\n<main id=\"main\"><section class=\"section\"><div class=\"section__inner prose\"><span class=\"eyebrow\">{{b21}}</span><h1>{{b10}}</h1><p class=\"about-intro\">{{b11}}</p><p class=\"contact-note\">{{b12}}</p><div class=\"contact-actions\"><a class=\"btn\" href=\"{{email}}\">{{b13}}</a><a class=\"btn\" href=\"{{b14}}\">{{b22}}</a><a class=\"btn\" href=\"{{b15}}\">{{b23}}</a></div></div></section></main>\n<footer class=\"site-footer\"><div class=\"site-footer__inner\"><a class=\"brand\" href=\"{{route.home}}\">{{b24}}</a><ul class=\"site-footer__links\"><li><a href=\"{{route.now}}\">{{b16}}</a></li><li><a href=\"{{route.about}}\">{{b17}}</a></li></ul><p class=\"site-footer__meta\">{{b25}}</p></div></footer>{{script}}</body></html>",
  "css": "*{box-sizing:border-box}body{margin:0;background:#f7f6f2;color:#25332f;font:18px/1.65 system-ui,sans-serif}a{color:inherit}.skip-link{position:absolute;left:1rem;top:-5rem}.skip-link:focus{top:1rem;background:white;padding:.5rem}.site-header{border-bottom:1px solid #d7ddd5}.site-header__inner,.site-footer__inner{max-width:1120px;margin:auto;padding:1.5rem;display:flex;align-items:center;gap:1.5rem}.brand{font-weight:750;text-decoration:none}nav{display:flex;gap:1rem;margin-left:auto}nav a,.lang-switch a{font-size:.85rem;text-decoration:none}.lang-switch{display:flex;gap:.5rem}.nav-toggle{display:none}.section{padding:6rem 1.5rem}.section__inner{max-width:760px;margin:auto}.eyebrow{text-transform:uppercase;font-size:.8rem;letter-spacing:.15em}h1{font-size:clamp(2rem,5vw,4rem);line-height:1.15;margin:1rem 0 2rem}.about-intro{font-size:1.25rem}.contact-note{color:#56645b}.contact-actions{display:flex;flex-wrap:wrap;gap:.8rem;margin-top:2rem}.btn{border:1px solid #718174;border-radius:.3rem;padding:.6rem 1rem;text-decoration:none}.btn:first-child{background:#365745;color:white}.site-footer{border-top:1px solid #d7ddd5}.site-footer__links{display:flex;list-style:none;gap:1rem;margin-left:auto}.site-footer__meta{font-size:.8rem}:focus-visible{outline:3px solid #b77826;outline-offset:3px}@media(max-width:800px){.site-header__inner{flex-wrap:wrap}nav{display:none;order:4;flex-basis:100%;flex-direction:column;margin:0}nav.is-open{display:flex}.nav-toggle{display:block}.section{padding:3rem 1.5rem}.site-footer__inner{flex-wrap:wrap}.site-footer__links{margin-left:0}}",
  "js": "(()=>{const toggle=document.querySelector('.nav-toggle');const nav=document.querySelector('#site-nav');if(!toggle||!nav)return;toggle.addEventListener('click',()=>{const open=nav.classList.toggle('is-open');toggle.setAttribute('aria-expanded',open?'true':'false');});})();"
};
