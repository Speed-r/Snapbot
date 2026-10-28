# Snap-Bot

Discord-Bot für die **Snap-Sonderchannel-Einstellungsregel**: Wer in der Vorwoche früh gepostet hat,
muss diese Woche bis zu einer festen Uhrzeit warten. Dazu kommen Listen, Wochenwechsel und ein
automatischer Abschluss des Wochen-Channels.

---

## 1. Die Regel

Es gibt immer zwei Channels:

- **Erster Channel**: der Channel der *Vorwoche*
- **Folge-Channel**: der Channel *dieser* Woche

Wer im ersten Channel **vor Uhrzeit X** gepostet hat, egal an welchem Tag, ist ein **Frühposter** und
darf im Folge-Channel erst **ab X Uhr** posten. Wer dort **nach X** oder **gar nicht** gepostet hat,
darf **sofort** posten. So ergibt sich von selbst ein Wechsel:

| Woche | Channel | Person A postet … | … und darf in der nächsten Woche |
|---|---|---|---|
| 1 | A | um 12:52 (früh) | erst ab X |
| 2 | B | gar nicht | sofort |
| 3 | C | um 09:30 (früh) | erst ab X |
| 4 | D | um 16:10 (spät) | sofort |

### So setzt der Bot die Regel durch

- **Warte-Rolle:** Jeden Tag vor X Uhr bekommen alle Frühposter die Rolle **„⏳ Wartet“**. Diese Rolle
  darf im Folge-Channel nicht schreiben. Um X Uhr nimmt der Bot sie allen wieder weg.
  Im Channel gibt es dafür nur **einen einzigen** Rechte-Eintrag, egal wie viele Leute warten.
  Der Bot legt die Rolle beim ersten Mal selbst an. Im Einstellungs-Menü (Bereich *Optionen*) kannst du auch eine eigene wählen.
- **Hinweis:** Postet ein Frühposter trotzdem zu früh, zum Beispiel weil die Sperre aus ist oder der Bot
  offline war, markiert der Bot ihn im Hinweis-Channel:

  > @Person
  >
  > Bitte beachte die Snap-Sonderchannel-Einstellungsregel.
  > Kannst es dann gern ab 16:00 Uhr einstellen 🫶
  > Lies gern nochmal nach #regeln › 💬

- **Optional löschen:** Den zu frühen Post kann der Bot auch automatisch löschen.
- **Bild gelöscht?** Löscht jemand sein Früh-Bild im ersten Channel, um es zu bearbeiten, ist er nach ein
  paar Sekunden kein Frühposter mehr und wird freigegeben. Das gilt auch für Bilder von vor dem Bot-Start.
- **Nur ein Beitrag:** Im Folge-Channel darf jeder nur **einen** Beitrag posten. Ein weiterer wird sofort gelöscht und
  die Person bekommt im Hinweis-Channel den Text *Nur ein Beitrag*. Wer seinen Beitrag selbst löscht (z. B. falsches Bild),
  darf neu posten. Mit *Nur Bilder: an* zählen nur Posts mit Bild, reine Text-Nachrichten bleiben stehen.
  Schalter *1️⃣ Nur ein Beitrag* im Bereich 🔧 Optionen (Standard: an).
- **Ausnahme-Rollen** gelten nur für die Sperre und *Nur ein Beitrag*: keine Sperre, kein Hinweis, kein Löschen. In `/listen` stehen sie ganz normal
  (bei den Frühpostern mit 🛡️ markiert) und beim Abschluss zählen sie mit.

---

## 2. Wochenwechsel

| Woche | Erster Channel | Folge-Channel |
|---|---|---|
| 1 | A | B |
| 2 | B | C |
| 3 | C | D |

Jede Woche im `/channel`-Menü **eins** davon:

- **➕ Erstellen + neue Woche:** Namen eingeben, der Bot legt den Channel an und startet die Woche.
- **📅 Neue Woche** (Auswahl): einen schon vorhandenen Channel wählen und mit *✅ Ja* bestätigen.

Der bisherige Folge-Channel wird dabei zum ersten Channel. Alle Einstellungen bleiben gleich.
Die Frühposter der alten Woche werden sofort gesperrt, falls es noch vor X Uhr ist.

---

## 3. Abschluss: Folge-Channel automatisch schließen

Der Folge-Channel wird geschlossen, sobald **eins** davon eintritt, je nachdem, was zuerst kommt:

| Auslöser | Was passiert |
|---|---|
| **Bilder voll:** `anzahl` *verschiedene* Leute haben ein Bild gepostet | Rolle verliert „Nachrichten senden“, Text *Bilder voll* |
| **Zeit um:** `wochentag` + `uhrzeit` erreicht, Channel noch offen | Rolle verliert „Nachrichten senden“, Text *Zeit um* |

- Jede Person zählt nur einmal, auch Ausnahme-Rollen zählen mit. Bots und gelöschte zu frühe Posts zählen nicht.
- Der Abschlusstext ist die letzte Nachricht im Channel. Mit *Meldung: aus* wird still geschlossen.
- Wieder geöffnet wird **nur manuell** im `/channel`-Menü mit *🔓 Folge-Channel öffnen*.
- Nach dem Wochenwechsel startet der neue Folge-Channel offen.

Eingestellt wird das im Einstellungs-Menü, Bereich **🏁 Abschluss**: Wochentag, Rolle, Anzahl, Uhrzeit, Meldung.
Ausschalten: Anzahl `0` bzw. Uhrzeit `aus`. Ohne eigene Rolle wird @everyone gesperrt.

---

## 4. Befehle

Es gibt fünf Befehle: `/einstellungen`, `/channel`, `/person`, `/listen` und `/nachricht`. Jeder öffnet direkt ein **Menü**, es gibt
keine Felder auszufüllen. Alle Menüs sehen gleich aus: oben die Werte als Kästchen, darunter Auswahlfelder und Buttons,
rechts unten **Schließen** (löscht die Menü-Nachricht).

Alle Antworten sind **für jeden sichtbar**. Der Bot pingt dabei niemanden an, außer beim Regel-Hinweis.

### `/einstellungen` – das Einstellungs-Menü
Oben siehst du die aktuellen Werte als Kästchen, darunter die Bedienelemente. Mit dem Dropdown **Bereich**
wechselst du zwischen den Teilen. Jede Änderung wird **sofort gespeichert** und das Menü zeigt gleich den neuen Stand.

| Bereich | Bedienung |
|---|---|
| 📺 **Regel** | Auswahl für *Erster Channel*, *Folge-Channel*, *Hinweis-Channel* · Buttons *⏰ Uhrzeit* und *🔗 Regel-Link* (öffnen ein Eingabefenster) |
| 🔧 **Optionen** | Schalter *🔒 Sperre*, *🗑️ Löschen*, *🖼️ Nur Bilder*, *🔍 Bildvergleich*, *1️⃣ Nur ein Beitrag* (grün = an, grau = aus) · *🎯 Toleranz* (Fenster) · Auswahl *⏳ Warte-Rolle* |
| 🏁 **Abschluss** | Auswahl *Wochentag* und *Rolle* · Buttons *📸 Anzahl*, *⏰ Uhrzeit* (Fenster) · Schalter *📣 Meldung* |
| 🛡️ **Ausnahmen** | Rollen-Auswahl: alle Ausnahme-Rollen anhaken (mehrere möglich) |
| 📝 **Texte** | Buttons öffnen das Fenster für *Hinweis*, *Bilder voll*, *Zeit um*, *Ein Beitrag* |

Beim ersten Mal: im Bereich **Regel** die drei Channels und die Uhrzeit setzen, vorher ist die Regel nicht aktiv.
Bedienen darf das Menü nur, wer „Server verwalten“ hat. **Schließen** löscht die Menü-Nachricht.

Zur Info, was die Optionen bedeuten:

| Option | Bedeutung | Standard |
|---|---|---|
| Sperre | Frühposter bis X Uhr sperren | an |
| Warte-Rolle | Rolle für Gesperrte | Bot legt „⏳ Wartet“ an |
| Löschen | zu frühe Posts löschen | aus |
| Nur Bilder | nur Posts mit Bild zählen | an |
| Bildvergleich | nur melden, wenn es **dasselbe Bild** ist | aus |
| Toleranz | wie ähnlich Bilder sein müssen (0–20) | 8 |
| Nur ein Beitrag | weiteren Beitrag im Folge-Channel löschen | an |

### `/channel` – das Channel-Menü
Zeigt die aktuelle Woche: erster Channel, Folge-Channel, ob er offen oder geschlossen ist, Uhrzeit, Hinweis-Channel.

| Bedienung | Wofür |
|---|---|
| 📅 **Neue Woche** (Auswahl) | vorhandenen Channel als neuen Folge-Channel wählen, danach *✅ Ja + Rechte übernehmen*, *Ja, Rechte so lassen* oder *Abbrechen* |
| ➕ **Channel erstellen** | Fenster mit Namen; der Channel kommt in die Kategorie des Folge-Channels und bekommt dessen **Berechtigungen** und *Langsamen Modus* |
| ➕ **Erstellen + neue Woche** | wie oben und startet gleich die neue Woche |
| 🔓 **Folge-Channel öffnen** | geschlossenen Folge-Channel wieder öffnen (nur aktiv, wenn er geschlossen ist) |
| 🔄 | Anzeige aktualisieren |

**Berechtigungen übernehmen:** Kopiert werden alle Rechte-Einträge des bisherigen Folge-Channels (Rollen und Personen).
Weggelassen wird nur, was der Bot selbst setzt: die Warte-Rolle, sein eigener Eintrag und die „Nachrichten senden“-Sperre
vom Abschluss. Der neue Channel startet also offen.
Außerdem ist ein neuer Channel **standardmäßig für @everyone unsichtbar** („Kanal ansehen“ verweigert). Der Bot bekommt einen
eigenen Eintrag, damit er ihn trotzdem sieht. Sichtbar wird er für die Rollen, die im Vorchannel „Kanal ansehen“ erlaubt haben.

### `/person` – das Personen-Menü
Zeigt alle, die gerade gesperrt sind (3 Spalten, 15 pro Seite, ⬅️ ➡️), und wie viele heute von Hand freigegeben wurden.

| Bedienung | Wofür |
|---|---|
| 📣 **Markieren mit Hinweistext** (Auswahl) | Person von Hand im Hinweis-Channel markieren – Text *Hinweis* (Uhrzeit-Regel) |
| 1️⃣ **Markieren mit „Nur ein Beitrag“** (Auswahl) | Person von Hand markieren – Text *Ein Beitrag* |
| 🔓 **Person entsperren** (Auswahl) | Sperre einer Person aufheben, gilt bis Tagesende |
| 🔓 **Alle entsperren** | alle Gesperrten auf einmal freigeben, wirkt sofort, gilt bis Tagesende |
| 🔄 **Aktualisieren** | Anzeige neu laden |

### `/listen` – das Listen-Menü
Gleicher Stil wie das Einstellungs-Menü: Personen als Kästchen in **3 Spalten**, 15 pro Seite.
Oben wählst du die **Ansicht**:

| Ansicht | Zeigt | Bedienung |
|---|---|---|
| ⏰ **Frühposter** | erster Channel: wer vor der Uhrzeit gepostet hat (mit Datum) und gespeicherte Namen (💾) | 💾 Speichern · 📄 Datei · 🔄 Aktualisieren |
| 📺 **Folge-Channel** | alle, die im Folge-Channel gepostet haben | 💾 Speichern · 📄 Datei · 🔄 Aktualisieren |
| 📜 **Verlauf** | alle, die je in einem Channel gepostet haben, **auch vor dem Bot-Start**, mit Anzahl Posts | Channel-Auswahl · Zeitraum (komplett, 7/14/30/90 Tage) · Schalter *⏰ Nur vor X* und *🖼️ Nur Bilder* · 💾 Speichern · 📄 Datei |
| 💾 **Gespeichert** | gespeicherte Namen eines Channels | Channel-Auswahl · *Person entfernen* (Auswahl) · 🗑️ Alle löschen (mit Rückfrage im Menü) |

Unten: **⬅️ 1/3 ➡️** zum Blättern und **Schließen**.
- **💾 Speichern** schreibt alle Namen der Ansicht in die Datei *dieses Channels* (`config/gespeichert/`). Ist der
  Channel der erste Channel, zählen die gespeicherten Namen wie Frühposter und stehen mit 💾 auf der Liste.
- **📄 Datei** schickt die Liste als Textdatei (beim Verlauf mit Aufstellung pro Tag).
- Die Listen werden 1 Minute zwischengespeichert, damit Blättern sofort geht. **🔄 Aktualisieren** liest neu.
- Schließen darf, wer die Liste geöffnet hat, oder wer „Nachrichten verwalten“ hat.

### `/nachricht` – freie Nachricht über den Bot
1. Channel wählen. Danach öffnet sich ein Fenster.
2. Text schreiben (bis 2000 Zeichen, Discord-Formatierung und Emojis gehen).
3. Absenden: Der Bot postet die Nachricht, das Menü zeigt einen Link dazu.

- **🔔 Pings** (Schalter, Standard aus): *aus* zeigt Erwähnungen nur an, ohne zu pingen. *an* pingt erwähnte Personen
  und Rollen, `@everyone`/`@here` nur, wenn du das selbst darfst.
- Senden geht nur in Channels, in denen du selbst schreiben darfst. In der Konsole steht, wer wohin gesendet hat.

### Texte
Die Texte (Hinweis, Bilder voll, Zeit um, Ein Beitrag) stellst du im Einstellungs-Menü im Bereich **📝 Texte** ein.

| Text | Wann | Platzhalter |
|---|---|---|
| Hinweis | Regel-Markierung | `{user}` `{uhrzeit}` `{regel}` |
| Bilder voll | wenn genug Leute gepostet haben | `{anzahl}` `{max}` `{uhrzeit}` `{channel}` |
| Zeit um | wenn die Zeit um ist | `{anzahl}` `{max}` `{uhrzeit}` `{channel}` |
| Ein Beitrag | wenn ein weiterer Beitrag gelöscht wurde | `{user}` |

### Wer darf was
| Befehl | Recht |
|---|---|
| `/einstellungen` | Server verwalten |
| `/channel` | Kanäle verwalten (*Öffnen* und *Neue Woche* zusätzlich: Server verwalten) |
| `/person`, `/listen`, `/nachricht` | Nachrichten verwalten (im Listen-Menü 💾 Speichern, Entfernen und Löschen: Server verwalten) |

Du kannst das unter *Servereinstellungen → Integrationen → Snap-Bot* pro Rolle anpassen.
Weil jeder die Menüs sieht, prüft der Bot bei jedem Klick die Rechte noch einmal. Blättern und Aktualisieren darf jeder.

---

## 5. Einrichtung

1. Im [Discord Developer Portal](https://discord.com/developers/applications) eine Application mit Bot anlegen und das Token kopieren.
2. Unter **Bot → Privileged Gateway Intents** den **Message Content Intent** einschalten und speichern.
3. Unter **OAuth2 → URL Generator** die Scopes `bot` und `applications.commands` wählen, dazu diese Rechte:
   *View Channels, Send Messages, Read Message History, Manage Channels, Manage Messages, Manage Roles*.
   Mit dem Link den Bot einladen.
4. **Rollen-Reihenfolge:** In den Servereinstellungen die Rolle des Bots **über** „⏳ Wartet“ und über die
   Abschluss-Rolle (z. B. @Mitglied) ziehen. Admins und der Server-Owner können nie gesperrt werden.
5. [Node.js](https://nodejs.org) 20 oder neuer installieren, dann im Ordner:
   ```
   npm run update                       # neueste Versionen von discord.js, sharp, dotenv
   cp config/example.env config/.env    # Token eintragen (Windows: copy config\example.env config\.env)
   npm start
   ```
6. Auf dem Server `/einstellungen` ausführen und im Bereich **Regel** Channels und Uhrzeit setzen.

**Dauerhaft laufen lassen** (startet nach Absturz neu):
```
npm install -g pm2
pm2 start discord/index.js --name snap-bot
pm2 save
```

**Beenden:** Mit Strg+C oder `pm2 stop snap-bot` beendet sich der Bot sauber. Er schreibt die Listen,
speichert die Einstellungen und meldet sich bei Discord ab. Beim nächsten Start rechnet er alles neu,
auch was während der Offline-Zeit gepostet wurde.

**Backup:** Alle Einstellungen liegen im Ordner `config/`. Den Ordner ab und zu sichern.

---

## 6. Ordnerstruktur

```
snap-bot/
├─ config/
│  ├─ .env                 Token (aus example.env kopieren)
│  ├─ example.env          Vorlage für die .env
│  ├─ config.json          Einstellungen pro Server (legt der Bot selbst an)
│  └─ gespeichert/         gespeicherte Namen, eine Datei pro Channel (💾)
├─ discord/
│  ├─ index.js             Start, Ereignisse verbinden, Login, sauberes Beenden
│  ├─ befehle/
│  │  ├─ liste.js          Definition aller Slash-Commands
│  │  ├─ panel.js          Einstellungs-Menü (/einstellungen)
│  │  ├─ channelpanel.js   Channel-Menü (/channel)
│  │  ├─ personpanel.js    Personen-Menü (/person)
│  │  ├─ listenpanel.js    Listen-Menü (/listen)
│  │  ├─ nachrichtpanel.js freie Nachricht über den Bot (/nachricht)
│  │  ├─ menue.js          gemeinsame Bausteine aller Menüs
│  │  └─ ausfuehren.js     verteilt Befehle und Klicks auf die Menüs
│  ├─ ereignisse/
│  │  └─ nachrichten.js    neue, gelöschte, bearbeitete Nachrichten
│  └─ lib/
│     ├─ client.js         der Discord-Client
│     ├─ daten.js          config.json, gespeicherte Namen, Standardtexte
│     ├─ helfer.js         Zeit, Bilder, Nachrichten lesen, Konstanten
│     ├─ rechte.js         Warte-Rolle, sperren/freigeben, Ausnahme-Rollen
│     ├─ regel.js          Frühposter, Regelprüfung, Hinweis
│     ├─ ablauf.js         tägliche Sperre, Minuten-Takt, Wochenwechsel
│     ├─ abschluss.js      Channel schließen (Bilder voll / Zeit um)
│     ├─ listen.js         Frühposter- und Folge-Liste
│     ├─ verlauf.js        Verlauf eines Channels lesen und auswerten
│     └─ bildvergleich.js  Bild-Fingerabdruck für den Bildvergleich
├─ listen/                 Textdateien von /listen (Liste und Verlauf)
├─ package.json
└─ README.md
```
