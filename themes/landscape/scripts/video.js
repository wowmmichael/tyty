hexo.extend.tag.register('video', function (args) {
    return `<video width="500px" controls> <source src="${hexo.config.root + 'videos/' + args[0]}" type="video/mp4"> </video>`;
}, {
    async: true
});