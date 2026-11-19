# Geaccepteerde tijdelijke integratie

Enige mutatie-eigenaar: CMS-chat 01a1f49b-5ee0-7010-83f3-b62b8b94b041. Coördinatiechat heeft tijdelijke integratie expliciet geautoriseerd na PR36-review en deze tip/overlapinventaris. Geen mainmerge, deployment of gebruikersdatabasewijziging. Alle PRs zijn GitHub OPEN; review afgerond betekent niet gemerged.

Vastgezette basis main aed2c5369dab5243006e8f856f401b22e3113e90. CMS tip 3e4f764ade527ed2c79905526d4dc313e0f1923b, runtime fbb583f09c94411b9a4dadaf977d5daec31cce55 onafhankelijk akkoord /root/review_pr36. Planner tip84952d86b82ee4c1141f691156396c82ec1c4b74, runtime43c172c887e81fd09be999e1e28253825c4a4e12 onafhankelijk akkoord /root/review_pr35. Catalogus/docs tip8d3eaeb30d5a8501c064ad1e7a0e4af22779e2c3, runtime consumer264ce99cfd76493d0e4851de13d8c56ec524f23d onafhankelijk gereviewd. Remote heads vlak voor integratie gecontroleerd. CMS laatste twee docsbestanden verschillen van runtime; geen nieuwe code.

CMS en Planner hebben drie verschillende overlappende paden sinds de gemeenschappelijke basis: packages/shared/src/index.ts, server/api/package.json en pnpm-lock.yaml. SharedModal wijzigt alleen in Planner maar vereist gecombineerde consumerchecks. CMS en catalogustip delen alle media-fixture/services, uploadprocessor/service/rights en cataloguscontract/service/locales/consumer/owner/fixture bytegelijk. De shared localehelper en rootexports zijn eveneens gelijk. Geen losse foundation/consumercherry-picks. Catalogus mist in CMS alleen app/html/start, catalogusCLI/parserfixture en catalogus HTTP/UI/localetests plus docs. Upload/app.ts verschilt inhoudelijk: catalogusversie heeft expliciete publicread/exactboundloopbackorigin en derde optionsargument. Die gereviewde compositie is nodig voor catalogus-app; default originweigering blijft behouden.

Volgorde: eigen worktree vanaf vastgezette main. Volledige CMS-tip integreren, volledige Planner-tip eenmaal integreren, daarna volledige catalogus/docs-tip eenmaal integreren met inhoudelijke conflictbeslissingen. Gelijke blobs niet dupliceren. Alle unieke exports/scripts/dependencies verenigen. Lock niet blind overnemen: opnieuw berekenen uit verenigde manifests met pnpm11.10.0, daarna frozen install. Conflicten en hun beslissing vastleggen.

Acceptatie in dezelfde checkout: frozen install; volledige workspace typecheck/lint/test/build; normale lokale CMS/private+publicPlanner/catalogus starts op afzonderlijke expliciete loopbackpoorten en uitsluitend eigen synthetische opslag; basisflows, publieke booking, CMS/mediarechten/NL-EN-pins, SharedModal keyboard/dirty/async/focus en echte procesherstarts. Oude fixtures behouden. Stop eigen processen, bewijs listeners dicht. Onafhankelijke Astra-review op exacte integratie-SHA, noodzakelijke fixes met Sol6.1low. Geen extra contentfeatures.

## Vastgezette open PR-DAG

| PR | API-base | Branch | Head |
| --- | --- | --- | --- |
| #6 | main | feature/media-catalogus-ontwerp | 039b47580e5c62a9578fc4868bbd0bb284e41b87 |
| #7 | main | feature/cms-design-backlog | 02ac4291ba12987f0a30921339897185d25a7f32 |
| #8 | main | feature/media-contract-proef | de089d22998b76fda8b905fb7d3ba90e2f8a7fd4 |
| #9 | main | feature/planner-baseline-desktop | 847687e60a9c4a5f211a11317e2bcc9f4fcf022c |
| #10 | feature/cms-design-backlog | feature/cms-local-text | 0179a4ffeb2b340c421c7d1b43bd2913d410e07d |
| #11 | main | feature/media-upload-proef | 84e0bf9443802e0b8d2c48a1b40f77a2c036e762 |
| #12 | feature/planner-baseline-desktop | feature/planner-injected-storage | f86519c0271bf393017c55ac43a53e05f528d812 |
| #13 | feature/cms-local-text | feature/cms-media-reference | 06fc8e6af5aebaded00f17fd7274c6399e519c3c |
| #14 | main | feature/catalogus-portfolio-flow | d49f1493d126516b4187531d803d991295d62d8e |
| #15 | feature/planner-injected-storage | feature/planner-workspace-client | 40a45216e30dcefd508a851537dc556406ae1367 |
| #16 | main | feature/catalogus-snapshotbeheer | 1213dc891e9a582ad2a5a8440ab621feb719cdcf |
| #17 | feature/cms-media-reference | feature/cms-real-upload | 6a6628f20af3f48879b3a055c1860149f1f20fe2 |
| #18 | main | feature/catalogus-content-locales | ce7805d4fea17eb19720ae7dc67594db5fdd0c51 |
| #19 | main | feature/catalogus-locale-flow | 8eca7997e55aabf7788b013c96b118d72991b568 |
| #20 | feature/planner-workspace-client | feature/planner-atomic-sqlite | 303b7fd2695cc4bc7cb4b82cad7b69ddc3f25e8f |
| #21 | feature/cms-real-upload | feature/cms-pages-blocks | 0a9a9b76b0df289c404e97b2d05254dac7e62d74 |
| #22 | feature/catalogus-locale-flow | feature/catalogus-consumer-pins | 264ce99cfd76493d0e4851de13d8c56ec524f23d |
| #23 | feature/planner-atomic-sqlite | feature/planner-snapshot-tools | edf7d55aa9f24ba3ef6ecdb24e481c19ddeec7ae |
| #24 | feature/catalogus-consumer-pins | feature/catalogus-acceptatiematrix | 8d3eaeb30d5a8501c064ad1e7a0e4af22779e2c3 |
| #25 | feature/cms-pages-blocks | feature/cms-portfolio-block | 741cacf595b2b228be6fbed8a938e1ab66160a32 |
| #26 | feature/cms-portfolio-block | feature/cms-portfolio-text | 2fea3e3d8c259cb9b3cf1e9c0d1e9a551e0cb416 |
| #27 | feature/cms-portfolio-text | feature/cms-page-locales | e074f7cf999445c08d517e99a7dccc03118c05d2 |
| #28 | feature/planner-snapshot-tools | feature/planner-local-bookings | 9b5c81038d784994d929bbadbc4408bd9ecc828e |
| #29 | feature/cms-page-locales | feature/cms-ui-locales | ea1c8623833bbf029755cb1142efe22c6923939c |
| #30 | feature/planner-local-bookings | feature/planner-zones-capacity | fd9530db6c6a6ca1b0e7a255bcf6a7c59f176780 |
| #31 | feature/cms-ui-locales | feature/cms-shared-navigation | 0bb3c0d063cd9ad92a3c2e8b46f06596f93caea6 |
| #32 | feature/cms-shared-navigation | feature/cms-english-image | 80957852af15cb6576beeaa6bdb9578896800a9d |
| #33 | feature/planner-zones-capacity | feature/planner-local-public-booking | 22cd650e8f72471c734244da65d9cbccd7caa16b |
| #34 | feature/cms-english-image | feature/cms-english-portfolio | 9ec2c02940cffde0f318dd6e4e2d6b37e1790653 |
| #35 | feature/planner-local-public-booking | feature/planner-keyboard-demo | 84952d86b82ee4c1141f691156396c82ec1c4b74 |
| #36 | feature/cms-english-portfolio | feature/cms-home-english | 3e4f764ade527ed2c79905526d4dc313e0f1923b |
