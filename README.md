# Urkunden-Zuarbeit

Agentische Zuarbeit für die Vorbereitung eines Grundstückskaufvertrags. Aus den Unterlagen
eines Vorgangs entsteht ein geprüfter Datensatz für die Urkunde: jeder Wert mit Fundstelle,
jeder Status mit Grund, jede Bestätigung durch einen Menschen.

## Starten

```bash
cp .env.example .env
docker compose up
```

## env konfigurieren

1. OpenRouter API-Key einfügen. Der Key kann unter [openrouter.ai/workspaces/default/keys](https://openrouter.ai/workspaces/default/keys) erstellt werden.
2. In den Einstellungen von OpenRouter Training deaktivieren: [openrouter.ai/settings/privacy](https://openrouter.ai/settings/privacy) und Modelle mit Zero Data Retention wählen.
3. Ein multimodales Modell, das Bilder auslesen kann, auswählen. Modelle sind unter [openrouter.ai/models](https://openrouter.ai/models) gelistet. Standardmäßig ist Claude Sonnet 5 eingestellt.

[http://localhost:3000](http://localhost:3000) öffnen.