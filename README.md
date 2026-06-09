# analytics-be

TypeScript CLI workspace để snapshot và phân tích contract API backend Calatha.

## Nguồn API

- Swagger UI: https://api.calatha.com/swagger-ui/index.html
- OpenAPI JSON: https://api.calatha.com/v3/api-docs

## Cài dependencies

```powershell
npm install
```

## Tải snapshot hiện tại

Chạy lệnh:

```powershell
npm run snapshot
```

Kết quả được lưu theo timestamp:

```text
snapshots/<snapshot-id>/
  openapi.json
  manifest.json
```

`openapi.json` là spec đã tải về và format ổn định để phục vụ bước diff sau này.
`manifest.json` lưu metadata quan trọng: nguồn tải, thời điểm tải, checksum, số paths, operations, schemas, tags và phân bố method/tag.

Manifest có 2 checksum:

- `openapi_sha256`: checksum của OpenAPI raw sau khi sort key ổn định. Dùng để biết file Swagger có đổi bất kỳ thứ gì, kể cả mô tả/example.
- `contract_sha256`: checksum contract sau khi bỏ field thuần tài liệu như `description`, `summary`, `example`, `examples`. Dùng để tránh báo động giả khi Swagger sinh nội dung mô tả động.

## Tải với snapshot id cố định

Do cách npm xử lý flag trên Windows, dạng ổn định nhất là truyền snapshot id như positional argument:

```powershell
npm run snapshot -- 20260609-baseline
```

## Tải từ URL khác

Với option nâng cao, build CLI rồi gọi trực tiếp bằng Node:

```powershell
npm run build
node dist/cli.js snapshot --url https://api.calatha.com/v3/api-docs --snapshot-id 20260609-custom
```

## Diff hai snapshot

Dạng dễ dùng nhất trên Windows:

```powershell
npm run diff -- 20260609-baseline 20260610-after-deploy
```

Hoặc gọi trực tiếp CLI đã build:

```powershell
npm run build
node dist/cli.js diff --from snapshots/20260609-baseline --to snapshots/20260610-after-deploy
```

Kết quả được xuất ra:

```text
reports/diff-<from>-to-<to>.json
reports/diff-<from>-to-<to>.md
```

Report hiện nhận diện:

- endpoint mới, endpoint bị xóa, endpoint đổi contract;
- schema mới, schema bị xóa, schema đổi contract ở mức field-level;
- param thêm/xóa/đổi, đặc biệt param mới `required`;
- request body thêm/xóa/đổi;
- response status thêm/xóa/đổi;
- tag, `operationId`, security đổi;
- raw Swagger đổi nhưng contract không đổi.

Với schema đổi, report Markdown sẽ liệt kê chi tiết như:

- property thêm/xóa;
- required field thêm/xóa;
- type, format, `$ref` đổi;
- enum value thêm/xóa;
- constraint đổi như min/max, length, pattern;
- `items`, `additionalProperties`, `allOf`, `anyOf`, `oneOf` đổi.

Report JSON có thêm `schema_changes` để bước sau map sang source app buyer/seller tự động.

Mức độ ảnh hưởng:

- `BREAKING`: có nguy cơ làm app buyer/seller lỗi ngay, ví dụ endpoint bị xóa, thêm required param, response status bị xóa, schema bị xóa.
- `REVIEW_REQUIRED`: contract đổi nhưng cần người/consumer scanner đánh giá sâu hơn, ví dụ schema đổi hoặc request body đổi.
- `NON_BREAKING`: thường không làm client hiện tại hỏng, ví dụ endpoint mới, schema mới, optional param mới.
- `DOC_ONLY`: raw Swagger đổi nhưng contract sau normalize không đổi, thường là mô tả/example.

## Kiểm tra TypeScript

```powershell
npm run type-check
npm run build
```
