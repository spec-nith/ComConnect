const { startHttpService } = require("./runtime");
const { KnowledgeIndexWorker } = require("../services/knowledgeIndexService");

const worker = new KnowledgeIndexWorker();

startHttpService({
  serviceName: "knowledge-indexer",
  port: Number(process.env.PORT || 5107),
  registerRoutes(app) {
    app.get("/worker/status", async (req, res, next) => {
      try {
        res.json(await worker.status());
      } catch (error) {
        next(error);
      }
    });
  },
  async startDependencies() {
    await worker.start();
    return () => worker.close();
  },
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
