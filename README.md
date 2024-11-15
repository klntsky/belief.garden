# [🧘🏻‍♂️belief.garden](https://belief.garden)

A mini social network built around personal beliefs.

It allows you to share your views and opinions on various subjects - e.g. economics, politics, eating habits or philosophy of will, in the form of a public profile you can link in your bio on other social media.

# Preview

![Screenshot from 2024-10-20 10-29-34](https://github.com/user-attachments/assets/4027dea9-f5e0-457d-9171-6c25ddba41a8)

# Development


## Updating belief cards

1. Clone this repo
2. Edit `public/static/beliefs.json`. Make sure to keep the json file valid. You can use [this JSON format checker](https://jsonlint.com/).

## Re-generating images

If you want to contribute, but don't know how to use NodeJS, skip this step. I will do it for you.

If you have added or changed names of any beliefs, images have to be re-generated:

0. Run `npm install`
1. set `OPENAI_API_KEY` in `.env` file
3. If you have added or changed the name of a belief group, update prompts in `src/generateImage.js`
4. run `npm run generate-images` and `compress-images`
