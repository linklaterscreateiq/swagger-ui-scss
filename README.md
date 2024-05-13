# swagger-ui-scss

A repackaging of [Swagger UI's](https://github.com/swagger-api/swagger-ui) SCSS files, for use in projects that would
like to adapt them by overriding the variables.

## Usage

```sh
npm i @createiq/swagger-ui-scss
```

Replace any import of the default Swagger UI CSS file with a reference to main.scss:

```diff
- @import '~swagger-ui-react/swagger-ui.css';
+ @import '~@createiq/swagger-ui-scss/main.scss';
```

Then you can override the [variables that are used internally by Swagger UI](https://github.com/swagger-api/swagger-ui/blob/master/src/style/_variables.scss):

```scss
$color-primary: #6750a4;
```
