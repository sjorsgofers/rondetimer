# Karate – rondetimer

Intervaltimer voor rondes (boksen, kickboksen, karate, MMA …), gemaakt voor een iPad van 10 inch.

**Live:** https://sjorsgofers.github.io/rondetimer/

- Aantal rondes, rondetijd en pauze instelbaar (ingedrukt houden herhaalt de stap)
- Klok vult het hele scherm; groen = ronde, rood = pauze, geel = aftellen
- Kyokushin-logo als watermerk achter de klok, dus zonder dat de cijfers kleiner worden
- Telt altijd 10 seconden af voor de eerste ronde
- Boksbel bij begin (1×) en einde (3×) van elke ronde, klepper 10 seconden voor het einde
- Scherm blijft aan tijdens het timen; instellingen worden onthouden
- Werkt offline na de eerste keer openen

## Op de iPad zetten

Open de link in Safari → Deel-knop → **Zet op beginscherm**. De app opent dan schermvullend.

## Techniek

Statische site zonder build: `index.html`, `styles.css`, `app.js`. De bel wordt met de Web Audio API
gemaakt, er zijn geen geluidsbestanden.
