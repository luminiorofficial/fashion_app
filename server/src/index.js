const {loadConfig} = require("./config");
const {createApp} = require("./app");
const {InMemoryRepository} = require("./repository");
const {LocalAssetStore} = require("./storage");
const {FashionAnalyzer} = require("./analyzer");
const {createSmsProvider} = require("./sms");

const config = loadConfig();
const repository = new InMemoryRepository();
const assetStore = new LocalAssetStore(config);
const analyzer = new FashionAnalyzer(config);
const smsProvider = createSmsProvider(config);

const app = createApp({config, repository, assetStore, analyzer, smsProvider});
app.listen(config.port, () => console.info(`NERA API listening on ${config.publicBaseUrl}/api/v1`));
