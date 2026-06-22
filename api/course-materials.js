import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

let courseMaterials = [
  {
    seriesId: 'peppa_01',
    seriesName: '粉红猪小妹 第一季',
    coverUrl: 'https://picsum.photos/id/237/100/100',
    episodes: [
      { episodeId: 'ep_01', episodeName: '第1集：Muddy Puddles', subtitleUrl: '/materials/peppa/ep01/subtitle.vtt', vocabularyUrl: '/materials/peppa/ep01/vocab.json', hasExercise: true, exerciseCount: 5 },
      { episodeId: 'ep_02', episodeName: '第2集：Mr. Dinosaur Is Lost', subtitleUrl: '/materials/peppa/ep02/subtitle.vtt', vocabularyUrl: '/materials/peppa/ep02/vocab.json', hasExercise: true, exerciseCount: 4 },
      { episodeId: 'ep_03', episodeName: '第3集：Best Friend', subtitleUrl: '', vocabularyUrl: '', hasExercise: false },
    ]
  },
  {
    seriesId: 'paw_01',
    seriesName: '汪汪队立大功 第一季',
    coverUrl: 'https://picsum.photos/id/1025/100/100',
    episodes: [
      { episodeId: 'ep_01', episodeName: '第1集：Pups Save a Train', subtitleUrl: '', vocabularyUrl: '', hasExercise: false },
      { episodeId: 'ep_02', episodeName: '第2集：Pups and the Snow Monster', subtitleUrl: '', vocabularyUrl: '', hasExercise: false },
    ]
  }
];

app.get('/api/course-materials', (req, res) => {
  res.json({
    success: true,
    data: courseMaterials.map(course => ({
      seriesId: course.seriesId,
      seriesName: course.seriesName,
      coverUrl: course.coverUrl,
      episodeCount: course.episodes.length
    }))
  });
});

app.get('/api/course-materials/:seriesId', (req, res) => {
  const { seriesId } = req.params;
  const course = courseMaterials.find(c => c.seriesId === seriesId);
  if (!course) {
    return res.status(404).json({ success: false, error: '课程不存在' });
  }
  res.json({ success: true, data: course });
});

app.get('/api/course-materials/:seriesId/episodes/:episodeId', (req, res) => {
  const { seriesId, episodeId } = req.params;
  const course = courseMaterials.find(c => c.seriesId === seriesId);
  if (!course) {
    return res.status(404).json({ success: false, error: '课程不存在' });
  }
  const episode = course.episodes.find(e => e.episodeId === episodeId);
  if (!episode) {
    return res.status(404).json({ success: false, error: '单集不存在' });
  }
  res.json({ success: true, data: episode });
});

app.put('/api/course-materials/:seriesId/episodes/:episodeId', (req, res) => {
  const { seriesId, episodeId } = req.params;
  const { subtitleUrl, vocabularyUrl, hasExercise, exerciseCount } = req.body;
  const course = courseMaterials.find(c => c.seriesId === seriesId);
  if (!course) {
    return res.status(404).json({ success: false, error: '课程不存在' });
  }
  const episode = course.episodes.find(e => e.episodeId === episodeId);
  if (!episode) {
    return res.status(404).json({ success: false, error: '单集不存在' });
  }
  if (subtitleUrl !== undefined) episode.subtitleUrl = subtitleUrl;
  if (vocabularyUrl !== undefined) episode.vocabularyUrl = vocabularyUrl;
  if (hasExercise !== undefined) episode.hasExercise = hasExercise;
  if (exerciseCount !== undefined) episode.exerciseCount = exerciseCount;
  res.json({ success: true, data: episode });
});

app.post('/api/course-materials', (req, res) => {
  const { seriesName, coverUrl } = req.body;
  const newCourse = {
    seriesId: `series_${Date.now()}`,
    seriesName,
    coverUrl,
    episodes: []
  };
  courseMaterials.push(newCourse);
  res.status(201).json({ success: true, data: newCourse });
});

app.post('/api/course-materials/:seriesId/episodes', (req, res) => {
  const { seriesId } = req.params;
  const { episodeName } = req.body;
  const course = courseMaterials.find(c => c.seriesId === seriesId);
  if (!course) {
    return res.status(404).json({ success: false, error: '课程不存在' });
  }
  const newEpisode = {
    episodeId: `ep_${Date.now()}`,
    episodeName,
    subtitleUrl: '',
    vocabularyUrl: '',
    hasExercise: false,
    exerciseCount: 0
  };
  course.episodes.push(newEpisode);
  res.status(201).json({ success: true, data: newEpisode });
});

app.delete('/api/course-materials/:seriesId/episodes/:episodeId', (req, res) => {
  const { seriesId, episodeId } = req.params;
  const course = courseMaterials.find(c => c.seriesId === seriesId);
  if (!course) {
    return res.status(404).json({ success: false, error: '课程不存在' });
  }
  const initialLength = course.episodes.length;
  course.episodes = course.episodes.filter(e => e.episodeId !== episodeId);
  if (course.episodes.length === initialLength) {
    return res.status(404).json({ success: false, error: '单集不存在' });
  }
  res.json({ success: true, message: '删除成功' });
});

export default app;
