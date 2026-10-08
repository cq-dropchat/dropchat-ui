import Fuse from "fuse.js";

export type SearchableConversation = {
  id: string;
  name: string | null;
  address: string;
};
export function createConversationSearch(items: SearchableConversation[]) {
  const fuse = new Fuse(items, {
    threshold: 0.4,
    includeScore: true,
    keys: ["name", "address"],
  });
  return (pattern: string) =>
    fuse
      .search(pattern)
      .map((result) => ({ id: result.item.id, score: result.score ?? 1 }));
}
