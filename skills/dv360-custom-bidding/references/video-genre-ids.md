# DV360 Custom Bidding — mapeo de `video_genre_ids`

Señal `video_genre_ids` (List of integers). Solo aplica a formatos de vídeo/audio;
las impresiones no-vídeo no se etiquetan.
Ver [Genre targeting](https://support.google.com/displayvideo/answer/13610700).

Uso típico:

```python
_GENEROS_VIAJE = {67, 3, 63}   # Travel & Transportation, Arts & Entertainment, Weather

return max_aggregate([
    ([click, 67 in video_genre_ids], 2.0),
    ([click], 1.0)
])
```

| ID | Género |
|---|---|
| 2 | /Adult |
| 3 | /Arts & Entertainment |
| 317 | /Arts & Entertainment/Comics & Animation/Anime & Manga |
| 319 | /Arts & Entertainment/Comics & Animation/Cartoons |
| 1108 | /Arts & Entertainment/Entertainment Industry/Film & TV Industry/Film & TV Awards |
| 569 | /Arts & Entertainment/Events & Listings |
| 1273 | /Arts & Entertainment/Events & Listings/Live Sporting Events |
| 895 | /Arts & Entertainment/Humor/Live Comedy |
| 1097 | /Arts & Entertainment/Movies/Action & Adventure Films |
| 1099 | /Arts & Entertainment/Movies/Action & Adventure Films/Western Films |
| 1095 | /Arts & Entertainment/Movies/Comedy Films |
| 615 | /Arts & Entertainment/Movies/Horror Films |
| 1105 | /Arts & Entertainment/Movies/Musical Films |
| 1310 | /Arts & Entertainment/Movies/Romance Films |
| 616 | /Arts & Entertainment/Movies/Science Fiction & Fantasy Films |
| 1096 | /Arts & Entertainment/Movies/Thriller, Crime & Mystery Films |
| 35 | /Arts & Entertainment/Music & Audio |
| 449 | /Arts & Entertainment/Offbeat/Occult & Paranormal |
| 23 | /Arts & Entertainment/Performing Arts |
| 894 | /Arts & Entertainment/Performing Arts/Acting & Theater |
| 581 | /Arts & Entertainment/Performing Arts/Dance |
| 1185 | /Arts & Entertainment/Performing Arts/Opera |
| 358 | /Arts & Entertainment/TV & Video/TV Shows & Programs |
| 1047 | /Arts & Entertainment/TV & Video/TV Shows & Programs/TV Comedies |
| 1411 | /Arts & Entertainment/TV & Video/TV Shows & Programs/TV Documentary & Nonfiction |
| 1193 | /Arts & Entertainment/TV & Video/TV Shows & Programs/TV Dramas |
| 1111 | /Arts & Entertainment/TV & Video/TV Shows & Programs/TV Dramas/TV Crime & Legal Shows |
| 357 | /Arts & Entertainment/TV & Video/TV Shows & Programs/TV Dramas/TV Soap Operas |
| 1110 | /Arts & Entertainment/TV & Video/TV Shows & Programs/TV Family-Oriented Shows |
| 1050 | /Arts & Entertainment/TV & Video/TV Shows & Programs/TV Game Shows |
| 1049 | /Arts & Entertainment/TV & Video/TV Shows & Programs/TV Reality Shows |
| 1112 | /Arts & Entertainment/TV & Video/TV Shows & Programs/TV Sci-Fi & Fantasy Shows |
| 1410 | /Arts & Entertainment/TV & Video/TV Shows & Programs/TV Talent & Variety Shows |
| 1048 | /Arts & Entertainment/TV & Video/TV Shows & Programs/TV Talk Shows |
| 24 | /Arts & Entertainment/Visual Art & Design |
| 47 | /Autos & Vehicles |
| 1191 | /Autos & Vehicles/Bicycles & Accessories |
| 1405 | /Autos & Vehicles/Bicycles & Accessories/Mountain Bikes |
| 273 | /Autos & Vehicles/Motor Vehicles (By Type)/Motorcycles |
| 148 | /Autos & Vehicles/Motor Vehicles (By Type)/Off-Road Vehicles |
| 185 | /Beauty & Fitness/Fashion & Style |
| 94 | /Beauty & Fitness/Fitness |
| 241 | /Beauty & Fitness/Fitness/Bodybuilding |
| 1418 | /Beauty & Fitness/Fitness/Fitness Instruction & Personal Training |
| 46 | /Business & Industrial/Agriculture & Forestry |
| 5 | /Computers & Electronics |
| 122 | /Food & Drink/Cooking & Recipes |
| 39 | /Games/Card Games |
| 924 | /Games/Card Games/Poker & Casino Games |
| 41 | /Games/Computer & Video Games |
| 698 | /Games/Gambling/Sports Betting/Horse & Dog Racing |
| 939 | /Games/Table Games/Billiards |
| 940 | /Games/Table Games/Table Tennis |
| 45 | /Health |
| 284 | /Hobbies & Leisure/Crafts |
| 688 | /Hobbies & Leisure/Outdoors |
| 462 | /Hobbies & Leisure/Outdoors/Fishing |
| 461 | /Hobbies & Leisure/Outdoors/Hunting & Shooting |
| 999 | /Hobbies & Leisure/Recreational Aviation |
| 678 | /Hobbies & Leisure/Special Occasions/Holidays & Seasonal Events |
| 459 | /Hobbies & Leisure/Water Activities/Boating |
| 11 | /Home & Garden |
| 158 | /Home & Garden/Home Improvement |
| 966 | /Law & Government/Government/State & Local Government |
| 75 | /Law & Government/Legal |
| 366 | /Law & Government/Military |
| 16 | /News |
| 784 | /News/Business News |
| 396 | /News/Politics |
| 1201 | /News/Politics/Opinion & Commentary |
| 1077 | /News/Sports News |
| 785 | /News/Technology News |
| 63 | /News/Weather |
| 113 | /People & Society/Ethnic & Identity Groups/Lesbian, Gay, Bisexual & Transgender |
| 58 | /People & Society/Family & Relationships/Family/Parenting |
| 59 | /People & Society/Religion & Belief |
| 870 | /People & Society/Self-Help & Motivational |
| 57 | /People & Society/Social Issues & Advocacy/Charity & Philanthropy |
| 82 | /People & Society/Social Issues & Advocacy/Green Living & Environmental Issues |
| 886 | /Pets & Animals/Pets/Dogs |
| 888 | /Pets & Animals/Pets/Horses |
| 119 | /Pets & Animals/Wildlife |
| 690 | /Reference/General Reference/Biographies & Quotations |
| 694 | /Reference/General Reference/How-To, DIY & Expert Content |
| 433 | /Reference/Humanities/History |
| 1288 | /Reference/Humanities/History/Military History |
| 174 | /Science |
| 18 | /Shopping |
| 64 | /Shopping/Antiques & Collectibles |
| 292 | /Shopping/Auctions |
| 69 | /Shopping/Consumer Resources |
| 1666 | /Sports/Animal Sports |
| 568 | /Sports/Animal Sports/Equestrian |
| 515 | /Sports/Combat Sports/Boxing |
| 516 | /Sports/Combat Sports/Martial Arts |
| 1674 | /Sports/Combat Sports/Martial Arts/Mixed Martial Arts |
| 512 | /Sports/Combat Sports/Wrestling |
| 1681 | /Sports/Combat Sports/Wrestling/Professional Wrestling |
| 554 | /Sports/Extreme Sports |
| 1206 | /Sports/Extreme Sports/Drag & Street Racing |
| 1000 | /Sports/Individual Sports |
| 1016 | /Sports/Individual Sports/Bowling |
| 458 | /Sports/Individual Sports/Cycling |
| 261 | /Sports/Individual Sports/Golf |
| 519 | /Sports/Individual Sports/Gymnastics |
| 262 | /Sports/Individual Sports/Racquet Sports |
| 1376 | /Sports/Individual Sports/Racquet Sports/Tennis |
| 541 | /Sports/Individual Sports/Running & Walking |
| 1126 | /Sports/Individual Sports/Skate Sports |
| 518 | /Sports/Individual Sports/Track & Field |
| 513 | /Sports/International Sports Competitions/Olympics |
| 180 | /Sports/Motor Sports |
| 1595 | /Sports/Motor Sports/Auto Racing |
| 1596 | /Sports/Motor Sports/Motorcycle Racing |
| 1001 | /Sports/Team Sports |
| 258 | /Sports/Team Sports/American Football |
| 259 | /Sports/Team Sports/Baseball |
| 264 | /Sports/Team Sports/Basketball |
| 534 | /Sports/Team Sports/Cheerleading |
| 296 | /Sports/Team Sports/Cricket |
| 1017 | /Sports/Team Sports/Handball |
| 260 | /Sports/Team Sports/Hockey |
| 517 | /Sports/Team Sports/Rugby |
| 294 | /Sports/Team Sports/Soccer |
| 699 | /Sports/Team Sports/Volleyball |
| 118 | /Sports/Water Sports |
| 1593 | /Sports/Water Sports/Surfing |
| 1594 | /Sports/Water Sports/Swimming |
| 265 | /Sports/Winter Sports |
| 1149 | /Sports/Winter Sports/Ice Skating |
| 1148 | /Sports/Winter Sports/Skiing & Snowboarding |
| 67 | /Travel & Transportation |

## Recursos de IDs relacionados

| Recurso | Dónde |
|---|---|
| DMA, browser, ISP, mobile make/model, OS, exchange, language | [Custom bidding ID sheet (.xlsx)](https://storage.googleapis.com/support-kms-prod/ItunR3x2VSY67ztAJe24BuhvAF7WJmF6m9sk) |
| Country / region codes e IDs | [PDF de mapeos](https://storage.googleapis.com/support-kms-prod/8cJKvMpQIKLP0pVran4OjW5cF87n2bxHTapH) |
| `adx_page_categories` | [Verticals de AdWords API](https://developers.google.com/adwords/api/docs/appendix/verticals) |
| `city_id`, `zip_postal_code` | [DV360 API](https://developers.google.com/display-video/api/reference/rest) o [metadatos SDF](https://support.google.com/displayvideo/answer/6301070) |
