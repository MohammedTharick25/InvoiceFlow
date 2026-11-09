module.exports = {
  migrationsDir: "migrations",
  changelogCollectionName: "databaseChangeLog",
  migrationFileExtension: ".js",
  moduleSystem: "esm",
  mongodb: {
    url: process.env.MONGODB_URI,
    databaseName: process.env.MONGODB_DATABASE,
    options: { serverSelectionTimeoutMS: 10000 },
  },
};
