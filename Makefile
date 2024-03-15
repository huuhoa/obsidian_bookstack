OUTPUT_PACKAGE_NAME = obsidian-bookstack
PACKAGE_VERSION = v1.0.0

clean:
	rm -rf dist
	rm -rf ${OUTPUT_PACKAGE_NAME}
	rm -f ${OUTPUT_PACKAGE_NAME}.zip

build:
	yarn run build

dev:
	yarn run dev

release:
	rm -rf dist
	yarn run build
	mkdir -p dist/${OUTPUT_PACKAGE_NAME}
	cp main.js manifest.json styles.css dist/${OUTPUT_PACKAGE_NAME}
	cd dist && zip -r ${OUTPUT_PACKAGE_NAME}_${PACKAGE_VERSION}.zip *
	mv dist/${OUTPUT_PACKAGE_NAME}_${PACKAGE_VERSION}.zip ./
