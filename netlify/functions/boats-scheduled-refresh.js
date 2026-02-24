import { getCachedBaseDataset } from "./_boats/shared.js";

export default async () => {
  await getCachedBaseDataset({ forceRefresh: true });
};

export const config = {
  schedule: "*/30 * * * *", // every 30 mins (UTC)
};
