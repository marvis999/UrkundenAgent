# Testaufgabe: Agentische Urkunden-Zuarbeit

**NotarPartner GmbH · Junior Fullstack Engineer (Schwerpunkt Agentic Workflows)**
Abgabe: Montag, 07.09.2026, 9:00 Uhr · Rückfragen jederzeit per E-Mail an marc.borowy@notarpartner.de

## Das Szenario

Ein Notariat bereitet die Beurkundung eines Immobilienkaufvertrags vor. Der Urkundentext existiert bereits als Vorlage - was fehlt, sind die Daten. Und die kommen nie sauber und strukturiert an, sondern so, wie der Alltag sie liefert: als Grundbuchauszug-Scan, als abfotografierte Aktenordner-Seite, als Excel-Ausdruck mit handschriftlichen Notizen.

Konkret: Verkauft werden soll das Mehrfamilienhaus **Hamburger Straße 89 a+b in 25746 Heide**. Verkäuferin ist die als Eigentümerin im Grundbuch eingetragene Gesellschaft; Käuferin ist die Norddeutsche Wohnwerte GmbH (fiktiv). Die Objektunterlagen im Anhang sind **echte Dokumente** aus einer realen Transaktionsanbahnung - der Eigentümer hat der Nutzung für diese Aufgabe zugestimmt, die Mietliste ist aus Datenschutzgründen geschwärzt. Behandle das Material bitte entsprechend vertraulich: nicht weitergeben, nicht in öffentliche Repos oder als Kontext an Dienste hochladen, die Trainingsnutzung nicht ausschließen, und nach Abschluss des Prozesses löschen.

## Deine Aufgabe

Baue eine kleine Web-App, in der ein agentischer Workflow die notarielle Zuarbeit übernimmt: Aus der Makler-E-Mail (unten) und den Anhängen soll am Ende ein befüllter, geprüfter Datensatz für den Kaufvertrag entstehen - und ein sinnvoller Umgang mit allem, was auf dem Weg dahin fehlt, unklar, veraltet oder widersprüchlich ist.

Alles Weitere entscheidest du selbst: wie viel der Agent alleine macht und wo ein Mensch draufschaut, wie diese Interaktion aussieht, wie das System mit Unsicherheit umgeht, was es aktiv nachfordern würde - und was du bewusst **nicht** baust.

Ein Hinweis, mehr nicht: Das Material ist echt. Echt heißt: nicht perfekt.

## Bewusst offen

Wir geben dir keine Akzeptanzkriterien, keine Feature-Liste und keine Musterlösung. Das ist Absicht. Du wirst beim Bauen KI einsetzen - das ist ausdrücklich erwünscht, wir arbeiten selbst so. Genau deshalb interessiert uns nicht, ob du eine Checkliste abarbeiten kannst, sondern **wie du denkst**: welche Annahmen du triffst, welche Probleme du überhaupt als Probleme erkennst, und wie du entscheidest, was ein verlässliches System in einem Umfeld ausmacht, in dem ein falsch übertragener Wert echten Schaden anrichtet.

## Rahmen

Stack: bitte TypeScript End-to-End, das ist unser Stack. Zur Orientierung: Wir arbeiten mit Next.js, TypeScript, Supabase und Vercel. Modellwahl ist frei (eigener API-Key). Zeitbudget: Es ist ein Wochenende, kein Sprint - wir erwarten keinen fertigen Produktumfang, sondern ein durchdachtes System.

## Abgabe

1. **Git-Repo** (privat, Zugang für marc.borowy@notarpartner.de bzw. Link per Mail) mit Code und README inkl. Deployment-Anleitung (die App muss bei uns lauffähig sein). Die Originaldokumente bitte nicht ins Repo einchecken - eine Lade-Anleitung genügt.
2. **3-Minuten-Video**: Screenwalkthrough - was macht die App, was hast du dir dabei gedacht.
3. **Eine Seite Notizen**: deine Annahmen, deine wichtigsten Entscheidungen und Trade-offs, was du bewusst weggelassen hast, und wie du KI beim Bauen eingesetzt hast (was hat funktioniert, wo hast du eingegriffen).

---

## Feldliste des Kaufvertrags (Mindestumfang)

| Feld | |
|---|---|
| Verkäufer | Eingetragene Eigentümerin lt. Grundbuch, Rechtsform, vertretungsberechtigte Personen, Nachweise |
| Käufer | Firma, Registerdaten, Vertretung, Anschrift |
| Grundbuch | Amtsgericht, Grundbuch von, Blatt |
| Grundstücke | Sämtliche verkauften Flurstücke mit Gemarkung, Flur, Größe, Wirtschaftsart |
| Kaufpreis | Betrag in Ziffern und Worten |
| Finanzierung | Grundschuldbestellung für die finanzierende Bank (Gläubiger, Betrag) |
| Belastungen | Eintragungen Abteilung II und III und wie mit ihnen verfahren wird (Übernahme / Löschung / Ablösung) |
| Mietverhältnisse | Bestand der übergehenden Mietverhältnisse (§ 566 BGB), Fläche, Jahresnettomiete |
| Energieausweis | Pflichtangaben (Art, Wert, Gültigkeit) |
| Übergabe | Besitzübergang (Datum/Regelung) |

Fehlt etwas, ist etwas veraltet oder nicht belastbar, gehört auch das zum Ergebnis deines Systems.

## Quelldokument 0 - E-Mail des Maklers

> **Von:** t.brinkmann@brinkmann-immobilien-nord.de
> **An:** info@notariat-musterstadt.de
> **Betreff:** Beurkundung MFH Hamburger Straße 89 a+b, Heide - Unterlagen
>
> Sehr geehrte Damen und Herren,
>
> wie telefonisch besprochen übersende ich Ihnen die Unterlagen für die Beurkundung. Verkäuferin ist die im Grundbuch eingetragene Eigentümergesellschaft, die Damen melden sich wegen der Terminabstimmung direkt bei Ihnen. Käuferin ist die Norddeutsche Wohnwerte GmbH; den Handelsregisterauszug und die Vertretungsnachweise reichen wir kurzfristig nach.
>
> Kaufpreis wie verhandelt 2.100.000 EUR. Die Käuferin finanziert über die Sparkasse Westholstein, die Grundschuld soll über 1.650.000 EUR bestellt werden. Das Objekt ist voll vermietet, die Jahresnettomiete liegt bei 152.640 EUR. Übergabe ist zum 01.12.2026 geplant, spätestens zwei Wochen nach vollständiger Kaufpreiszahlung.
>
> Anbei alle Objektunterlagen, die mir vorliegen (Grundbuch, Energieausweis, Flurkarte, Flächenberechnungen, Mietübersicht).
>
> Nachtrag zu unserem Telefonat von eben: Die Parteien haben sich final auf 2.060.000 EUR geeinigt, bitte diesen Betrag verwenden.
>
> Mit freundlichen Grüßen
> Thomas Brinkmann
> Brinkmann Immobilien Nord GmbH

## Anhänge (Dateien)

1. `grundbuch_15.11.11.pdf` - Grundbuchauszug (Scan, 12 Seiten)
2. `HeideEnergieausweis_Hamburger_Str89ab_Heide.pdf` - Energieausweis
3. `heideFlurkarte.pdf` - Lageplan und Flurkarte (Fotos aus dem Bauordner)
4. `Wohnflaechenberechnung_1991_Foto.jpg` - Wohn-/Nutzflächenberechnung des Architekten (Foto)
5. `heideumbauterRaum.pdf` - Berechnung des umbauten Raums (Foto aus dem Bauordner)
6. `HeideMieteaktuell_geschwaerzt.pdf` - Mietübersicht (Mieternamen geschwärzt)

*Die Käuferin und der Makler in dieser Aufgabe sind fiktiv; die Objektunterlagen sind echt und vertraulich zu behandeln.*
