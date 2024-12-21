import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import FeedList from './components/FeedList';
import SearchResults from './components/SearchResults';
import ChatsView from './components/ChatsView';
import GunFeedList from './components/GunFeedList';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<FeedList />} />
          <Route path="feed/:feedId" element={<FeedList />} />
          <Route path="folder/:folderId" element={<FeedList />} />
          <Route path="starred" element={<FeedList />} />
          <Route path="listened" element={<FeedList />} />
          <Route path="chats" element={<ChatsView />} />
          <Route path="search/:query" element={<SearchResults />} />
          <Route path="gun/:pubKey" element={<GunFeedList />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
