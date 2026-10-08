import {
  createConversationSearch,
  type SearchableConversation,
} from "./conversationSearch";
let search = createConversationSearch([]);
self.onmessage = ({
  data,
}: MessageEvent<{
  items?: SearchableConversation[];
  pattern?: string;
  requestId: number;
}>) => {
  if (data.items) search = createConversationSearch(data.items);
  if (data.pattern !== undefined)
    self.postMessage({ requestId: data.requestId, ids: search(data.pattern) });
};
