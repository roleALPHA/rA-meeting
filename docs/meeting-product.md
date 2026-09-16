# Zielbild: Spannung → Meeting → geprüfte Ergebnisse

## Kundenhoheit und einfache Nutzung

Die produktive App ist eine SPFx-Erweiterung für SharePoint und Teams. Logik läuft im Browser, Daten liegen in einer SharePoint-Indexliste und Dokumentbibliothek im Kunden-Tenant. Es gibt keinen Appserver, keine SQL-Datenbank und keine Hintergrund-Runtime der Meeting-App. Alle optionalen KI-/MCP-Ziele müssen kundenseitig betrieben und für direkten delegierten Browserzugriff geeignet sein; Hersteller-Proxys sind nicht enthalten.

Ein SharePoint-Arbeitsbereich ist gemeinsam sichtbar. Dessen Rechte entscheiden über Lesen und gemeinsame Bearbeitung. Die früheren serverseitigen Ersteller-/Teilnehmerrechte und privaten Spannungen sind kein Sicherheitsmodell der Browser-App. Vertrauliche Kreise verwenden getrennt berechtigte Websites. Alle Bearbeitungsberechtigten können moderieren, Agendaeinträge und Templates ändern. Die Ersteinrichtung erfolgt durch die SharePoint-Administration.

Die Oberfläche ist in Deutsch, Englisch, Französisch und Spanisch verfügbar. Datum/Zeit und manuelle KI-Anfragen folgen der gewählten Sprache. Nutzereingaben, gespeicherte Vorlagen und historische Originaltexte werden nicht automatisch übersetzt. Die Sprache der Startvorlagen wird bei Installation eingestellt. Sprache und Terminologie werden als zwei persönliche Einstellungen im Browser des Kunden gespeichert; keine Meetinginhalte landen in localStorage.

Anwender können den Spannungsspeicher als „Spannungen“ oder „Agenda“ anzeigen lassen. Titel, Eingabehinweise und Aktionen passen sich an. Die fachlichen IDs und Verknüpfungen bleiben unverändert.

## Standardablauf ohne Power Automate

1. Bestehenden Outlook-/Teams-Termin mit einem rA-Meeting verbinden.
2. Spannungen vor oder während des Termins einbringen, auch durch berechtigte Teilnehmer.
3. Im Meeting Agenda bearbeiten, Ergebnisse erfassen.
4. Transkript bewusst auswählen/abrufen und „Ergebnisse analysieren“ starten.
5. Ergebnisvorschläge samt Quellen, Wortlaut, Typ und Zuständigkeit prüfen.
6. Bestätigte Ergebnisse ausdrücklich an den kundenseitigen MCP-Endpunkt übertragen.
7. Gegebenenfalls zusätzliche Freigabe des Entwurfs in roleALPHA.

Power Automate bleibt eine optionale spätere Erweiterung für Erinnerungen und Hintergrundverarbeitung; es ist keine Voraussetzung und darf keine Nutzerbestätigung ersetzen. Die Browser-App verarbeitet nichts bei geschlossenem Tab; alle Analysen und Exporte werden ausdrücklich gestartet.

## Spannungsspeicher

roleALPHA hat keinen Spannungsspeicher. Die Meeting-App führt ihn selbst. Ablage: Record-Typ `tension` in der kundeneigenen SharePoint-Indexliste mit JSON-Inhalt in der Dokumentbibliothek.

Spannungen tragen Titel, Beschreibung, Kreis/Team, Ersteller, Version und Status. Sichtbarkeit folgt dem SharePoint-Arbeitsbereich. Sie existieren unabhängig von einem Meeting. Eine Agenda kann über `tensionId` darauf verweisen; eine Spannung kann in mehreren Meetings behandelt werden. Ergebnisse sind über ihr Agendaelement auf die Spannung zurückführbar. „Agendaelement bearbeitet“ oder „Ergebnis exportiert“ bedeutet nicht automatisch „Spannung gelöst“. Den Abschluss bestätigen berechtigte Bearbeiter ausdrücklich.

Berechtigte Bearbeiter können Agendaeinträge vor und während des Meetings einbringen. Die Browser-App nutzt keine frei eingegebenen Entra-Mitglieder-IDs für vermeintliche Privatsphäre oder Rechteerhöhung. Das Teilen und Verwalten des Arbeitsbereichs erfolgt über SharePoint.

## Kalender

Outlook ist die führende Quelle für Zeit und Beitrittslink. rA-Meetings hält die fachliche Meetinginstanz. In der Browser-App:
- vorhandene Termine suchen (gestern bis 30 Tage in die Zukunft, maximal 200 Treffer, Kürzung sichtbar);
- konkreten Termin bzw. konkrete Serien-Durchführung verbinden;
- manuell abgleichen, Absage anzeigen, Teams-/Outlook-Link öffnen;
- keine Einladungen, keine Terminänderungen, kein automatischer Kalender-Sync.

Die Kalenderverknüpfung allein installiert noch keinen Teams-Tab. Dieser muss separat im Teams-Termin hinterlegt werden. Beim Öffnen des konfigurierten Tabs ist das rA-Meeting über dessen URL bekannt; die Einwahl selbst erzeugt oder öffnet kein rA-Meeting. Einträge sind auch vor dem Termin möglich. Spätere Teams-Kontexterkennung/Teilnehmerübernahme braucht einen eigenen Berechtigungsnachweis.

Serientranskripte können dieselbe OnlineMeeting-ID teilen. Bis zur sicheren Abgrenzung des jeweiligen Transkripts verlangt der Prototyp bei verknüpften Serienterminen einen manuellen Import.

## Ergebnisse und MCP

Ergebnistypen sind unabhängig vom Meetingtyp: Aufgabe, Projekt, Rolle, Policy, Kennzahl, Checkliste, OKR, Risiko, IT-System und Notiz. Das Template definiert pro Schritt eine erlaubte Auswahl. Eine Spannung kann mehrere verschiedene Ergebnisse hervorbringen.

Zwei ausdrücklich unterschiedliche Exporte:
1. **Meetingprotokoll:** bestehendes `create_meeting` mit bestätigten Ergebnissen und Quellen.
2. **Einzelne Entität:** konfigurierter Ergebnistyp → kundenseitiger MCP-Dienst → tatsächlich angebotenes kompatibles `create_*`-Tool.

Beispiel der früheren Backend-Konfiguration (für SPFx stattdessen `spfx/customer.config.json` gemäß Installationsanleitung verwenden):

```text
ROLEALPHA_ENTITY_ROUTES={"risk":{"url":"https://customer-risk.example/mcp","tool":"create_risk","label":"Risiko"}}
```

Auch OKR-/IT-System-Routen müssen explizit gesetzt werden. Ihre Toolnamen werden nicht geraten. Vor einem Schreibaufruf prüft die Anwendung, ob das Tool vorhanden ist und den bisherigen roleALPHA-Erstellvertrag (`tenant_uuid`, `name`, optional `custom_id` und `data`) unterstützt. Schemaabweichungen werden abgelehnt. Der Kunde/Integrator muss zusätzlich das konkrete Fachschema abnehmen; die Prüfung ersetzt keine vollständige JSON-Schema-Validierung kundenspezifischer Daten.

Die Browser-App erzeugt eine Vorschau. Beim Bestätigen werden Meetingrevision und exakter Exportplan erneut geprüft. Die KI darf keine Tools/Endpunkte wählen. Pro Entität werden Ergebnis-ID und Remote-Entwurf-ID gespeichert; eine unklare Antwort sperrt Wiederholungen bis zum dokumentierten Abgleich.

Die Beschreibung, Verantwortlichen, Quellen und Genehmigung werden unter `data.raMeeting` übermittelt. `outcome.data` kann weitere fachliche Attribute enthalten; aktuell gibt es noch keine schemabasierten Formulare für spezifische Risiko-/OKR-/IT-Felder. Der native Zielentitätsname wird gesetzt. Änderungen/Löschungen bestehender Entitäten sind nicht implementiert; dafür braucht es Zielobjektzuordnung, Änderungsvergleich und Konfliktprüfung.

Für Endanwender gehören diese Integrationsdetails in die Installation, nicht in den Meetingablauf.

## Ohne roleALPHA-Verbindung

Die MCP-Anbindung ist vollständig optional. Ohne MCP-Einstellungen bleiben Spannungsspeicher, Vorlagen, Kalenderverknüpfung (mit Microsoft-Freigabe), Meetingablauf, Transkriptimport, optionale KI-Auswertung und Ergebnisprüfung nutzbar. Bestätigte Ergebnisse bleiben in der Meeting-App. Es gibt keine Pflicht zum Export und keine MCP-Anfragen beim Start oder bei der Analyse. Ohne konfiguriertes Ziel werden Exportaktionen ausgeblendet; die Verbindungsseite bietet MCP als freiwillige Erweiterung an.

## Vorschlagsformulierung und Einwandintegration

Die KI kann schon während eines Meetings unterstützen. Pro offenem Agendapunkt kann die Moderation einen Vorschlag aus Bedarf und Kontext formulieren lassen oder einen vorhandenen Vorschlag anhand genannter Einwände weiterentwickeln. Rückfragen, Begründung und Integrationsideen erscheinen als unverbindliche Vorschau. Die Moderation kann Text übernehmen, ändern und als Entwurf speichern. Die KI entscheidet weder über Einwandgültigkeit noch über Zustimmung. Eine gespeicherte Formulierung ist kein bestätigtes Ergebnis. Ergebnisprüfung und optionaler MCP-Export bleiben separate Schritte.
