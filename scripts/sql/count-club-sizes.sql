-- Read-only: the clubs' output-size switches (portrait and story sizes plan,
-- migration 0083). Run before and after 0083; expect square_on = 0 and
-- no_feed_size = 0 after.
select count(*) as clubs,
       count(*) filter (where size_square) as square_on,
       count(*) filter (where size_portrait) as portrait_on,
       count(*) filter (where not size_square and not size_portrait) as no_feed_size
  from social_settings;
