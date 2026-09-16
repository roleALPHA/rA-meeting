# Technischer Anhang zur Bereitstellung

Dieser Anhang richtet sich an die Personen, die das Installationspaket erstellen oder die optionalen Schnittstellen betreiben. Für die Installation des fertigen Pakets verwenden Sie die [Schritt-für-Schritt-Anleitung](customer-deployment.md).

## KI und roleALPHA ohne Proxy

Beide sind optional. Ein Anbieter muss **direkte Browseraufrufe mit CORS** und **delegierte Entra-Anmeldung** unterstützen. Bestehende Server, die nur einen geheimen API-Schlüssel oder technischen Bearer akzeptieren, sind ohne Änderung nicht kompatibel. Die App baut dafür keinen versteckten Proxy ein und fordert Endanwender nicht zur Eingabe von Schlüsseln auf.

Die Freigabe erfolgt für einen von Ihrer Organisation kontrollierten Dienst. Ihre Organisation muss Eigentum, Region und Datenverarbeitung des eingetragenen Endpunkts prüfen; Software kann aus einer URL allein keine Datenhoheit ableiten. Ein zentraler roleALPHA-SaaS-Endpunkt würde die geforderte Datenhoheit nicht erfüllen. Für MCP ausschließlich die passende organisationsgebundene roleALPHA-Umgebung verwenden.

Die Governance-Anbindung ist ausschließlich für roleALPHA vorgesehen. MCP ist das technische Protokoll, kein frei wählbarer Anbieter. Ein einzelner roleALPHA-Endpunkt bedient Protokolle und alle freigegebenen Entitätstypen; eigene Endpunkte pro Entität und generische MCP-Konfigurationen werden abgelehnt. Die Administration trägt den für Ihre Organisation bereitgestellten roleALPHA-Endpunkt ein. Eine URL allein beweist dabei nicht die Identität eines Dienstes.

Der Paketbauer konfiguriert nicht geheime Endpunkte in `spfx/customer.config.json`. Das ausgelieferte Standardpaket enthält **keine** KI-/MCP-Ziele. Beispiel, ohne reale Zugangsdaten:

```json
{
  "language": "de",
  "ai": {
    "url": "https://ai.organisation.example/v1/chat/completions",
    "resource": "api://ORGANISATION-AI-APPLICATION-ID",
    "permissionResource": "Organisation AI",
    "scope": "access_as_user",
    "model": "organisation-model"
  },
  "roleAlpha": {
    "url": "https://rolealpha.organisation.example/mcp",
    "resource": "api://ORGANISATION-ROLEALPHA-APPLICATION-ID",
    "permissionResource": "roleALPHA Governance",
    "scope": "access_as_user",
    "tenant": "11111111-1111-4111-8111-111111111111",
    "meeting": false,
    "entities": {
      "risk": {
        "tool": "create_risk",
        "label": "Risiko"
      }
    }
  }
}
```

`resource` ist die Entra-Audience des Dienstes. `permissionResource` ist dessen in Entra angezeigter Anwendungsname; `scope` ist der delegierte freigegebene Scope. Der Build nimmt diese Berechtigungen automatisch in die M365-Freigabeanforderungen des Pakets auf. Danach in API-Zugriff genehmigen; Dienste müssen das Token selbst korrekt auf Audience, Tenant, Scope und Benutzerrechte prüfen. SPFx-Freigaben gelten für den geteilten SharePoint-Clientprincipal, nicht isoliert nur für dieses Webpart.

Der Zielserver muss CORS für die tatsächlichen SharePoint-Origin(s) erlauben. Bei MCP insbesondere `Authorization`, `Content-Type`, `Mcp-Session-Id`, `MCP-Protocol-Version` sowie die benötigten HTTP-Methoden erlauben und `Mcp-Session-Id` exponieren. Bei tenantübergreifenden Benutzeranmeldungen/Guests sind die Dienstrechte gesondert zu prüfen. Bei fehlender Freigabe, CORS oder Netzwerkzugriff zeigt die Aktion einen Fehler; es gibt keinen Fallback über unsere Infrastruktur.

KI-Vertrag: Chat-Completions mit `model`, `messages`, `response_format: {"type":"json_object"}` und Antwort `choices[0].message.content`. Die Integration kann zur Auswertung sowie zu Proposal Forming und Einwandintegration genutzt werden. Modellantworten werden validiert. Einwände, Zustimmung und Beschlüsse bleiben menschliche Entscheidungen.

MCP-Vertrag: Streamable HTTP; `create_meeting` oder explizit zugeordnetes `create_*`-Tool mit `tenant_uuid`, `name`, `custom_id`, `data`. Vor dem Schreiben werden angebotene Tools und das gemeinsame Schema geprüft. Bestätigung erwartet `{"draft_created":true,"draftId":"…","entityUuid":"…","status":"draft"}`. Bei unklarer Antwort wird das Ergebnis gesperrt; keine automatischen Schreib-Retries. Nach Schließen des Tabs während eines Exports kann ein `sending`-Status zurückbleiben; nach fünf Minuten erlaubt die UI den dokumentierten manuellen Abgleich.


## Paket bauen (nur Entwicklung / Auslieferung)

```sh
npm ci
npm run spfx:install
npm test
npm run build
```

Root-Tools verwenden Node 24. Der Build verwendet für SPFx 1.23.2 die separat im Projekt installierte Node-22-Version. Diese Build-Werkzeuge sind **keine** zur Installation benötigte Laufzeitumgebung und werden nicht als Server ausgeliefert. React ist auf die von SPFx unterstützte Version 17.0.1 festgelegt. Vor einem Paketupdate `spfx/package.json` erhöhen; daraus entstehen Paket- und Lösungsversion.

Ergebnis: `dist/rolealpha-meetings.sppkg`. `includeClientSideAssets` bündelt den Code für das App-Katalog-Hosting. Ein Build-Check verbietet serverseitige Module, den früheren `/api`-Adapter und Test-/Demo-Code im Browserpaket.

`npm run dev` ist eine statische Browser-Demo mit simuliertem SharePoint. Sie enthält einen sichtbaren Hinweis und speichert nur im Arbeitsspeicher bis zum Neuladen. `npm run dev:legacy` / `npm run build:legacy` sind ausschließlich der frühere Prototyp. Dessen Container und Umgebungsvariablen werden für das neue Paket nicht gebraucht.


## Governance-Fragen: lesender roleALPHA-Vertrag

Zusätzlich zum KI-Ziel benötigt `roleAlpha` die optionale Einstellung `governance: { "searchTool": "search_governance" }`. Der Toolname ist ein Beispiel: Tragen Sie den tatsächlich bereitgestellten, geprüften Suchtoolnamen aus der roleALPHA-Installation ein. Ohne diese Freigabe bleibt die Governance-Hilfe deaktiviert. Eine Übereinstimmung mit einem produktiven roleALPHA-Lesetool wurde noch nicht verifiziert.

Der Adapter erwartet einen ausdrücklich lesenden Suchaufruf am selben roleALPHA-Endpunkt. Es gibt keine weitere MCP-Adresse und keine freie Toolauswahl durch das Modell. Das freigegebene Tool muss mit `search_` beginnen und in `tools/list` die Annotationen `readOnlyHint: true` und `destructiveHint: false` sowie die Parameter `tenant_uuid` (string), `query` (string), `limit` (number oder integer) anbieten. Weitere Pflichtparameter werden nicht unterstützt. Die Annotationen ersetzen keine serverseitigen Rechte: Der roleALPHA-Dienst muss die tatsächliche Leseberechtigung und Mandantenzuordnung des angemeldeten Benutzers prüfen und ausschließlich lesend arbeiten.

Der Aufruf übergibt die konfigurierte roleALPHA-Mandanten-ID, die eingegebene Frage und `limit: 12`. Die Antwort wird als `structuredContent` oder als JSON in einem MCP-Textblock erwartet:

```json
{
  "sources": [
    {
      "id": "role-finance",
      "title": "Rolle Finanzen",
      "content": "Originaltext der für die Frage relevanten Governance ..."
    }
  ]
}
```

IDs müssen eindeutig sein. Maximal zwölf Quellen mit je 12.000 Zeichen Inhalt werden angenommen. Die Suchantwort muss aus der bestehenden Governance stammen und darf keine als Original ausgegebenen Modellzusammenfassungen enthalten. Passen Sie bei abweichenden roleALPHA-Antwortformaten den Adapter anhand des tatsächlichen API-Vertrags an; eine beliebige JSON-Antwort wird nicht stillschweigend als Quelle akzeptiert.

Die KI erhält ausschließlich Frage und abgerufene Quellen. Ihre Antwort besteht aus Aussagen mit Quellen-IDs und Angaben zu offenen Punkten. Unbekannte Quellen-IDs werden abgewiesen; bei leerem Suchergebnis erfolgt kein KI-Aufruf. Die Prüfung einer Quellen-ID kann nicht beweisen, dass eine Aussage inhaltlich korrekt aus der Quelle abgeleitet wurde. Deshalb zeigt die Oberfläche die Originaltexte und weist auf den begrenzten Suchumfang hin. Es erfolgen weder Governance-Änderungen noch Meeting-Speicherzugriffe. Auch Personen mit SharePoint-Leserechten dürfen fragen; roleALPHA setzt seine eigenen Zugriffsrechte unabhängig davon durch.

Bei der Abnahme prüfen: tatsächlichen Suchtoolvertrag, Benutzer- und Mandantentrennung, unbeantwortbare Fragen, Quellenvergleich, delegierte Anmeldung und Browser-CORS. Fragen und Antworten bleiben nur im geöffneten UI; keine neue SharePoint-Ablage oder Vektordatenbank. Protokollierung durch KI und roleALPHA ist separat entsprechend den Vorgaben Ihrer Organisation zu konfigurieren.

## Einrichtungsassistent

Die SPFx-Hostanbindung erlaubt zusätzlich zur aktuellen Website explizit ausgewählte Websites auf demselben HTTPS-Host. Die Anmeldung und Request-Digests bleiben bei SPHttpClient. Fremde Origins und ungültige Websitepfade werden abgewiesen. Die Einrichtung läuft ausschließlich im geöffneten Browser.

Neue Websites verwenden `SPSiteManager/create` mit `STS#3` (Teamwebsite ohne Microsoft-365-Gruppe); vor dem Erstellen wird der Status geprüft. Es werden keine Teams, Gruppenmitgliedschaften oder API-Einwilligungen automatisch angelegt. Benutzerrechte und Organisationsrichtlinien setzen die Grenzen. Vertraulichkeitskennzeichnungen und besondere Websitevorlagen sind in dieser Version im Microsoft-Adminbereich vorzubereiten; dafür im Assistenten eine vorhandene Website wählen. Siehe [Microsoft Site-Creation REST](https://learn.microsoft.com/en-us/sharepoint/dev/apis/site-creation-rest).

Die optionale Einstiegsseite wird über die SharePoint-SitePages-Schnittstelle als Entwurf mit dem eigenen SPFx-Webpart vorbereitet. Die Graph-sitePage-API unterstützt nicht beliebige eigene Webparts. Vorhandene Seiten werden nicht überschrieben. Ein `setup/landing`-Datensatz hält die angelegte Seiten-ID für Wiederholungen fest. Bei Abbruch zwischen der Seitenerstellung und dieser Markierung kann ein leerer Entwurf zurückbleiben; dieser wird nicht automatisch gelöscht. Die Administration prüft und veröffentlicht die Seite selbst. Referenz für das SitePages-Verfahren: [PnPjs Clientside Pages](https://github.com/pnp/pnpjs/blob/version-4/packages/sp/clientside-pages/types.ts).

Der Speichertest legt einen Datensatz ohne Geschäftsinhalte an, liest ihn und entfernt den Indexeintrag. Wie bei sonstigen Löschungen bleibt dessen kleine Inhaltsdatei unter der vorhandenen Aufbewahrung bestehen. Wiederholungen verwenden bestehende Listen und Vorlagen. Die Sprachwahl gilt für noch nicht angelegte Startvorlagen, die Begriffswahl bleibt eine persönliche Präferenz.

Tenant-Abnahme: neue und vorhandene Websites, blockierte Websiteerstellung, geänderte Zugriffsrechte, verfügbare SPFx-Komponente auf der Zielwebsite, Seitenentwurf und Veröffentlichung, Unterbrechung/Wiederaufnahme sowie tatsächliche Teams-Registerkartenkonfiguration prüfen.
