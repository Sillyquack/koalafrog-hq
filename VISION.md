# Koalafrog

Ingredient Knowledge enriches Workspace Ingredients with explicit unknown states and traceable evidence. It is a knowledge foundation, not a prediction, safety, efficacy, or recommendation system. See `docs/INGREDIENT_KNOWLEDGE.md`.

## Hva er Koalafrog?

Koalafrog er et privat produktutviklingssystem for kosmetikk og grooming som hjelper én produsent hele veien fra idé til ferdig produkt.

Systemet skal gjøre det enkelt å utforske hva som kan lages, forstå hvilke ingredienser som passer sammen, se hva som allerede finnes på lager, identifisere hva som mangler og gjennomføre utvikling og produksjon på en trygg, strukturert og sporbar måte.

Koalafrog kombinerer kreativ produktutvikling med ingredienskunnskap, formulering, lagerstyring, utstyr, emballasje, innkjøp, laboratoriearbeid, testing, produksjon og dokumentasjon i én sammenhengende arbeidsflyt.

Målet er ikke å gjøre brukeren til administrator av et tungt system.

Målet er å gjøre det intuitivt og inspirerende å lage gode produkter, samtidig som nødvendig kvalitet, sporbarhet og compliance kan bygges opp i riktig tempo.

## Grunnprinsipper

Koalafrog starter med spørsmålet:

> Hva har jeg lyst til å lage?

Systemet skal deretter hjelpe med å svare på:

- Hva kan jeg lage med det jeg allerede har?
- Hvilke ingredienser passer til produktet og ønsket profil?
- Hvordan vil sammensetningen sannsynligvis oppføre seg?
- Hva mangler jeg?
- Hvordan lager, tester og forbedrer jeg produktet?
- Hva må dokumenteres før produktet kan produseres eller lanseres?

Kunnskap skal gjenbrukes.

Det som kan arves, beregnes eller utledes, skal ikke måtte registreres på nytt.

Prediksjoner skal aldri presenteres som observerte fakta.

Fysisk testing, sporbarhet og dokumentasjon skal følge ideen når den utvikles fra konsept til reelt produkt.

## Produktstudio og flerfaseutvikling

Beard Butter er den første varmeprosesserte flerfasemodellen i Product Studio. Den utvider Beard Oil-arbeidsflyten med eksplisitte formelfaser, temperaturgrenser, kontrollert nedkjøling, prosess-steg, variantvurdering og fasebevisst Lab-overlevering. Dette er strukturert utviklingsstøtte, ikke en erstatning for formuleringsekspertise, stabilitetstesting, sikkerhetsvurdering eller regulatorisk dokumentasjon.

Beard Oil og Beard Butter er produktsjablonger over en felles formuleringsmotor. Motoren beskriver gjenbrukbare arketyper og prosessegenskaper, mens sjablongen beholder produktmål, veiledning og evalueringskriterier. Planlagte arketyper skal være ærlig merket som utilgjengelige til regler og sikkerhetsgrenser faktisk er implementert.

Fra v0.12.0 er `solid_or_stick` en operativ arketype. Natural Deodorant er den første produktsjablongen og gjenbruker samme Formula-, Development-, Lab-, Testing-, emballasje- og lagergrenser som resten av systemet. Den støtter strukturerende materialer, væsker, pulverdispersjon, kontrollert fylling og fysisk evaluering uten å anta universelle temperaturer, effekt, sikkerhet eller regulatorisk status.

## Release-regel

Ingen ny stor fase starter før den forrige er verdt å beholde.

Det betyr at en fase skal være:

- testet
- verifisert i faktisk bruk
- committed
- tagget
- sikkerhetskopiert
- dokumentert
