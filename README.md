FamilyPedia

一个不需要数据库、可直接部署到 GitHub Pages 的中文家族族谱网站。

文件说明

index.html：家族树和人物搜索首页

person.html：人物资料页模板

family.json：人物及亲属关系数据

family.js：生成家族树和搜索结果

person.js：生成人物资料页

style.css：网站样式

.nojekyll：让 GitHub Pages 直接发布这些静态文件

发布到 GitHub Pages

把本压缩包中的文件上传到你的 familypedia 仓库根目录（不要把外层 familypedia 文件夹再套一层）。

打开仓库的 Settings → Pages。

在 Build and deployment 下选择 Deploy from a branch。

选择 main 分支和 /(root) 文件夹，然后保存。

等待几分钟，访问 https://YOUR_USERNAME.github.io/familypedia/。

修改资料

编辑 family.json。每个人都需要一个永久且唯一的 id。father、mother 和 spouses 填写的是其他人物的 ID，而不是姓名。

新增人物示例：

{
  "id": "P020",
  "name": "姓名",
  "gender": "female",
  "birth": "2000-01-01",
  "father": "P019",
  "mother": null,
  "spouses": [],
  "bio": "人物简介。"
}

注意：JSON 中最后一个人物对象后面不能有逗号。

本地预览

不能直接双击 index.html，因为浏览器通常会阻止它读取 family.json。可在该文件夹运行：

python -m http.server 8000

然后访问 http://localhost:8000/。
