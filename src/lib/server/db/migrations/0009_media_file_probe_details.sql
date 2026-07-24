alter table media_stream_info add column frame_rate real;
alter table media_stream_info add column r_frame_rate real;
alter table media_stream_info add column nb_frames integer;

alter table media_file add column video_frame_rate real;
alter table media_file add column audio_channels integer;
alter table media_file add column audio_sample_rate integer;
alter table media_file add column audio_language text;
alter table media_file add column audio_bit_rate integer;

update media_file set
  audio_channels = (select channels from media_stream_info where media_file_id = media_file.id and stream_type = 'audio' order by stream_index limit 1),
  audio_sample_rate = (select sample_rate from media_stream_info where media_file_id = media_file.id and stream_type = 'audio' order by stream_index limit 1),
  audio_language = (select language from media_stream_info where media_file_id = media_file.id and stream_type = 'audio' order by stream_index limit 1),
  audio_bit_rate = (select bit_rate from media_stream_info where media_file_id = media_file.id and stream_type = 'audio' order by stream_index limit 1)
where exists (select 1 from media_stream_info where media_file_id = media_file.id and stream_type = 'audio');
