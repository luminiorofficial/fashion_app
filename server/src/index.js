const {loadConfig} = require("./config");
const {createApp} = require("./app");
const {InMemoryRepository} = require("./repository");
const {LocalAssetStore} = require("./storage");
const {FashionAnalyzer} = require("./analyzer");

const config = loadConfig();
const repository = new InMemoryRepository();
const assetStore = new LocalAssetStore(config);
const analyzer = new FashionAnalyzer(config);
const smsProvider = {
  async sendOtp(phoneNumber, otp) {
    if (config.env === "production") throw new Error("Configure a production SMS provider before deployment.");
    console.info(`[development OTP] ${phoneNumber}: ${otp}`);
  },
};

const app = createApp({config, repository, assetStore, analyzer, smsProvider});
app.listen(config.port, () => console.info(`NERA API listening on ${config.publicBaseUrl}/api/v1`));
